import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { FirstAccessDto } from './dto/first-access.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthMailService } from './mail/auth-mail.service';
import { PermissionsService } from '../permissions/permissions.service';

const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.';

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

    if (!user) {
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
    const email = data.email.trim();
    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return {
        message: FORGOT_PASSWORD_GENERIC_MESSAGE,
      };
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    const base =
      process.env.FRONTEND_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';
    const resetUrl = `${base}/redefinir-senha?token=${encodeURIComponent(token)}`;

    await this.authMail.sendResetPassword({
      to: user.email,
      name: user.name?.trim() || 'usuário',
      resetUrl,
    });

    return {
      message: FORGOT_PASSWORD_GENERIC_MESSAGE,
    };
  }

  async resetPassword(data: ResetPasswordDto) {
    const passwordReset = await this.prisma.passwordResetToken.findFirst({
      where: {
        token: data.token,
        usedAt: null,
      },
      include: {
        user: true,
      },
      orderBy: {
        expiresAt: 'desc',
      },
    });

    if (!passwordReset) {
      throw new BadRequestException('Token inválido');
    }

    if (passwordReset.expiresAt < new Date()) {
      throw new BadRequestException('Token expirado');
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
}
