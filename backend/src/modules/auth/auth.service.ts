import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isClientPortalRole } from '../../common/security/client-portal-role';
import { LoginDto } from './dto/login.dto';
import { FirstAccessDto } from './dto/first-access.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateResetTokenDto } from './dto/validate-reset-token.dto';
import { AuthMailService } from './mail/auth-mail.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PresenceService } from '../../common/presence/presence.service';
import {
  delayResetGuard,
  generatePasswordResetCode,
  getFrontendBaseUrl,
  hashPasswordResetCode,
  normalizeResetTokenInput,
} from './password-reset.helper';
import { TotpService } from './totp.service';
import {
  createTotpTrustToken,
  totpTrustDays,
  verifyTotpTrustToken,
} from './totp-trust-cookie.helper';

const RESET_REQUESTS_PER_HOUR = 3;

const RESET_TOKEN_TTL_MINUTES = Number(
  process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? 30,
);

const RESEND_COOLDOWN_SECONDS = Number(
  process.env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS ?? 60,
);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authMail: AuthMailService,
    private readonly permissionsService: PermissionsService,
    private readonly presence: PresenceService,
    private readonly totp: TotpService,
  ) {}

  async login(data: LoginDto, opts?: { trustCookie?: string }) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: data.email, mode: 'insensitive' },
        deletedAt: null,
      },
      include: {
        company: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Usuário sem senha definida');
    }

    const passwordValid = await bcrypt.compare(
      data.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    if (user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    let totpTrustToken: string | undefined;

    if (user.totpEnabledAt) {
      const trusted = verifyTotpTrustToken(
        opts?.trustCookie,
        user.id,
        user.totpEnabledAt,
      );

      if (!trusted) {
        if (!data.totpCode?.trim()) {
          throw new UnauthorizedException({
            statusCode: 401,
            message: '2FA_REQUIRED',
            error: 'Unauthorized',
            requires2fa: true,
            trustDays: totpTrustDays(),
          });
        }
        await this.totp.assertValidCode(user.id, data.totpCode);
        if (data.rememberDevice) {
          totpTrustToken = createTotpTrustToken(user.id, user.totpEnabledAt);
        }
      } else {
        // Renova a janela de confiança neste dispositivo
        totpTrustToken = createTotpTrustToken(user.id, user.totpEnabledAt);
      }
    }

    const session = await this.createSessionForUser(user);
    return { ...session, totpTrustToken };
  }

  async loginWithOAuth(
    params: {
      provider: 'google' | 'microsoft';
      providerId: string;
      email: string;
      emailVerified: boolean;
    },
    opts?: { trustCookie?: string },
  ): Promise<
    | {
        status: 'authenticated';
        message: string;
        accessToken: string;
        user: {
          id: string;
          name: string;
          email: string;
          role: UserRole;
          companyId: string | null;
          companyName: string | null;
          firstAccess: boolean;
          permissions: unknown;
          totpEnabled: boolean;
        };
        totpTrustToken?: string;
      }
    | { status: '2fa_required'; userId: string; trustDays: number }
  > {
    if (!params.emailVerified) {
      throw new UnauthorizedException('oauth_not_verified');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: params.email.trim(), mode: 'insensitive' },
        deletedAt: null,
      },
      include: { company: true },
    });

    if (!user) {
      throw new UnauthorizedException('oauth_not_registered');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('oauth_inactive');
    }

    if (params.provider === 'google') {
      if (user.googleId && user.googleId !== params.providerId) {
        throw new UnauthorizedException('oauth_provider_mismatch');
      }
      if (!user.googleId) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId: params.providerId, provider: 'google' },
        });
      }
    }

    if (params.provider === 'microsoft') {
      if (user.microsoftId && user.microsoftId !== params.providerId) {
        throw new UnauthorizedException('oauth_provider_mismatch');
      }
      if (!user.microsoftId) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { microsoftId: params.providerId, provider: 'microsoft' },
        });
      }
    }

    if (user.totpEnabledAt) {
      const trusted = verifyTotpTrustToken(
        opts?.trustCookie,
        user.id,
        user.totpEnabledAt,
      );
      if (!trusted) {
        return {
          status: '2fa_required',
          userId: user.id,
          trustDays: totpTrustDays(),
        };
      }
    }

    const session = await this.createSessionForUser(user);
    let totpTrustToken: string | undefined;
    if (user.totpEnabledAt) {
      totpTrustToken = createTotpTrustToken(user.id, user.totpEnabledAt);
    }
    return { status: 'authenticated', ...session, totpTrustToken };
  }

  async completeOAuth2fa(
    userId: string,
    totpCode: string,
    rememberDevice: boolean,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { company: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE || !user.totpEnabledAt) {
      throw new UnauthorizedException('oauth_2fa_expired');
    }
    await this.totp.assertValidCode(user.id, totpCode);
    const session = await this.createSessionForUser(user);
    const totpTrustToken = rememberDevice
      ? createTotpTrustToken(user.id, user.totpEnabledAt)
      : undefined;
    return { ...session, totpTrustToken };
  }

  private async createSessionForUser(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    companyId: string | null;
    firstAccess: boolean;
    tokenVersion?: number;
    totpEnabledAt?: Date | null;
    company?: { name: string } | null;
  }) {
    const tokenVersion = user.tokenVersion ?? 0;
    const requestUser = await this.permissionsService.buildRequestUser(
      user.id,
      tokenVersion,
    );

    const payload = {
      sub: user.id,
      email: user.email,
      role: requestUser.role,
      companyId: requestUser.companyId,
      tv: tokenVersion,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    this.presence.touch(user.id);

    const activeName =
      requestUser.companies?.find((c) => c.id === requestUser.companyId)
        ?.name ??
      user.company?.name ??
      null;

    return {
      message: 'Login realizado com sucesso',
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: requestUser.role,
        companyId: requestUser.companyId,
        companyName: activeName,
        firstAccess: user.firstAccess,
        permissions: requestUser.permissions,
        companies: requestUser.companies ?? [],
        totpEnabled: Boolean(user.totpEnabledAt),
      },
    };
  }

  async switchCompany(userId: string, companyId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }
    if (!isClientPortalRole(user.role)) {
      throw new ForbiddenException(
        'Troca de empresa disponível apenas para usuários do portal cliente.',
      );
    }

    const membership = await this.prisma.userCompany.findUnique({
      where: {
        userId_companyId: { userId, companyId },
      },
      include: {
        company: { select: { id: true, name: true, deletedAt: true } },
      },
    });

    if (!membership || membership.company.deletedAt) {
      throw new BadRequestException('Empresa não vinculada a este usuário.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        companyId: membership.companyId,
        role: membership.clientRole as UserRole,
        tokenVersion: { increment: 1 },
      },
      include: { company: true },
    });

    return this.createSessionForUser(updated);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }

    const requestUser = await this.permissionsService.buildRequestUser(
      userId,
      user.tokenVersion ?? 0,
    );

    const activeName =
      requestUser.companies?.find((c) => c.id === requestUser.companyId)
        ?.name ??
      user.company?.name ??
      null;

    return {
      message: 'Token válido',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: requestUser.role,
        companyId: requestUser.companyId,
        companyName: activeName,
        firstAccess: user.firstAccess,
        permissions: requestUser.permissions,
        companies: requestUser.companies ?? [],
        totpEnabled: Boolean(user.totpEnabledAt),
        totpAdminMustEnable: this.totp.adminMustEnable(user),
      },
    };
  }

  beginTotpSetup(userId: string) {
    return this.totp.beginSetup(userId);
  }

  confirmTotpSetup(userId: string, code: string) {
    return this.totp.confirmSetup(userId, code);
  }

  disableTotp(userId: string, code: string, password: string) {
    return this.totp.disable(userId, code, password);
  }

  async firstAccess(data: FirstAccessDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: data.email, mode: 'insensitive' },
        deletedAt: null,
      },
    });

    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    if (!user.firstAccess) {
      throw new BadRequestException(
        'Este usuário não está mais em primeiro acesso',
      );
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Usuário sem senha definida');
    }

    const currentPasswordValid = await bcrypt.compare(
      data.currentPassword,
      user.passwordHash,
    );

    if (!currentPasswordValid) {
      throw new UnauthorizedException('Senha provisória inválida');
    }

    const newPasswordHash = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash: newPasswordHash,
        firstAccess: false,
        tokenVersion: { increment: 1 },
      },
    });

    return {
      message: 'Primeiro acesso concluído com sucesso',
    };
  }

  async forgotPassword(data: ForgotPasswordDto) {
    const genericMessage =
      'Se o e-mail estiver cadastrado, enviaremos um código de redefinição em instantes.';
    const cooldownSeconds = Number.isFinite(RESEND_COOLDOWN_SECONDS)
      ? Math.max(30, RESEND_COOLDOWN_SECONDS)
      : 60;

    const email = data.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
    });

    if (!user) {
      await delayResetGuard();
      return {
        message: genericMessage,
        resendCooldownSeconds: cooldownSeconds,
      };
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRequests = await this.prisma.passwordResetToken.count({
      where: {
        userId: user.id,
        createdAt: { gte: oneHourAgo },
      },
    });
    if (recentRequests >= RESET_REQUESTS_PER_HOUR) {
      throw new BadRequestException(
        'Limite de envios atingido. Aguarde até uma hora e tente novamente.',
      );
    }

    const ttlMinutes = Number.isFinite(RESET_TOKEN_TTL_MINUTES)
      ? Math.max(5, RESET_TOKEN_TTL_MINUTES)
      : 30;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    let plainCode = generatePasswordResetCode();
    let tokenHash = hashPasswordResetCode(plainCode);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const exists = await this.prisma.passwordResetToken.findUnique({
        where: { token: tokenHash },
        select: { id: true },
      });
      if (!exists) break;
      plainCode = generatePasswordResetCode();
      tokenHash = hashPasswordResetCode(plainCode);
    }

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: tokenHash,
        expiresAt,
      },
    });

    const resetPageUrl = `${getFrontendBaseUrl()}/redefinir-senha?token=${encodeURIComponent(plainCode)}`;

    const sent = await this.authMail.sendResetPassword({
      to: user.email,
      name: user.name?.trim() || 'usuário',
      resetCode: plainCode,
      resetPageUrl,
      expiresMinutes: ttlMinutes,
    });

    if (!sent) {
      throw new ServiceUnavailableException(
        'Não foi possível enviar o e-mail. Verifique a configuração SMTP do servidor ou tente mais tarde.',
      );
    }

    const exposeDevCode =
      process.env.NODE_ENV !== 'production' &&
      process.env.PASSWORD_RESET_EXPOSE_CODE_IN_DEV !== 'false';

    return {
      message: genericMessage,
      resendCooldownSeconds: cooldownSeconds,
      ...(exposeDevCode ? { devCode: plainCode } : {}),
    };
  }

  async validateResetToken(data: ValidateResetTokenDto) {
    const passwordReset = await this.findActivePasswordReset(data.token);
    if (!passwordReset) {
      await delayResetGuard();
      throw new BadRequestException('Código inválido ou expirado.');
    }
    return { message: 'Código válido' };
  }

  async resetPassword(data: ResetPasswordDto) {
    const passwordReset = await this.findActivePasswordReset(data.token);

    if (!passwordReset) {
      await delayResetGuard();
      throw new BadRequestException('Código inválido ou expirado.');
    }

    const newPasswordHash = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.user.update({
      where: {
        id: passwordReset.userId,
      },
      data: {
        passwordHash: newPasswordHash,
        firstAccess: false,
        tokenVersion: { increment: 1 },
      },
    });

    await this.prisma.passwordResetToken.update({
      where: {
        id: passwordReset.id,
      },
      data: {
        usedAt: new Date(),
      },
    });

    return {
      message: 'Senha redefinida com sucesso',
    };
  }

  private async findActivePasswordReset(rawToken: string) {
    const code = normalizeResetTokenInput(rawToken);
    if (!code || code.length < 8) return null;

    const tokenHash = hashPasswordResetCode(code);

    const passwordReset = await this.prisma.passwordResetToken.findFirst({
      where: {
        token: tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          deletedAt: null,
          status: UserStatus.ACTIVE,
        },
      },
      include: { user: true },
      orderBy: { expiresAt: 'desc' },
    });

    return passwordReset;
  }
}
