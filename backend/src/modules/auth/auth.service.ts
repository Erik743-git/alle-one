import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { FirstAccessDto } from './dto/first-access.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateResetTokenDto } from './dto/validate-reset-token.dto';
import { AuthMailService } from './mail/auth-mail.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  delayResetGuard,
  generatePasswordResetCode,
  getFrontendBaseUrl,
  hashPasswordResetCode,
  normalizeResetTokenInput,
} from './password-reset.helper';

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
  ) {}

  async login(data: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
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

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const requestUser = await this.permissionsService.buildRequestUser(user.id);

    return {
      message: 'Login realizado com sucesso',
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        companyName: user.company?.name ?? null,
        firstAccess: user.firstAccess,
        permissions: requestUser.permissions,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { company: true, permissions: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }

    return {
      message: 'Token válido',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        companyName: user.company?.name ?? null,
        firstAccess: user.firstAccess,
        permissions: this.permissionsService.computeEffective(user),
      },
    };
  }

  async firstAccess(data: FirstAccessDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: data.email,
      },
    });

    if (
      !user ||
      user.deletedAt ||
      user.status !== UserStatus.ACTIVE
    ) {
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

    const resetPageUrl = `${getFrontendBaseUrl()}/redefinir-senha`;

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
