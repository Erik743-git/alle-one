import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TotpService {
  constructor(private readonly prisma: PrismaService) {}

  private encryptionKey(): Buffer {
    const raw =
      process.env.TOTP_ENCRYPTION_KEY?.trim() ||
      process.env.JWT_SECRET?.trim() ||
      'dev-totp-key';
    return createHash('sha256').update(raw).digest();
  }

  encryptSecret(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decryptSecret(payload: string): string {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }

  async beginSetup(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { email: true, totpEnabledAt: true },
    });
    if (!user) throw new BadRequestException('Usuário não encontrado.');
    if (user.totpEnabledAt) {
      throw new BadRequestException('2FA já está ativo.');
    }

    const secret = generateSecret();
    const otpauth = generateURI({
      issuer: 'Alle One',
      label: user.email,
      secret,
    });
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecretEncrypted: this.encryptSecret(secret),
        totpEnabledAt: null,
        totpBackupCodesHash: null,
      },
    });

    return { secret, otpauth, qrDataUrl };
  }

  async confirmSetup(userId: string, code: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { totpSecretEncrypted: true, totpEnabledAt: true },
    });
    if (!user?.totpSecretEncrypted) {
      throw new BadRequestException('Inicie o setup 2FA primeiro.');
    }
    if (user.totpEnabledAt) {
      throw new BadRequestException('2FA já está ativo.');
    }
    const secret = this.decryptSecret(user.totpSecretEncrypted);
    const result = verifySync({ token: code.trim(), secret });
    if (!result.valid) throw new UnauthorizedException('Código 2FA inválido.');

    const backupCodes = Array.from({ length: 8 }, () =>
      randomBytes(4).toString('hex'),
    );
    const hashes = await Promise.all(
      backupCodes.map((c) => bcrypt.hash(c, 10)),
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabledAt: new Date(),
        totpBackupCodesHash: JSON.stringify(hashes),
      },
    });

    return { backupCodes };
  }

  async disable(userId: string, code: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { passwordHash: true },
    });
    if (!user) throw new BadRequestException('Usuário não encontrado.');
    if (!user.passwordHash) {
      throw new BadRequestException(
        'Esta conta não tem senha local. Defina uma senha antes de desativar o 2FA.',
      );
    }
    const passwordValid = await bcrypt.compare(
      password ?? '',
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Senha da conta inválida.');
    }

    await this.assertValidCode(userId, code);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecretEncrypted: null,
        totpEnabledAt: null,
        totpBackupCodesHash: null,
      },
    });
    return { ok: true };
  }

  async assertValidCode(userId: string, code: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        totpSecretEncrypted: true,
        totpEnabledAt: true,
        totpBackupCodesHash: true,
      },
    });
    if (!user?.totpEnabledAt || !user.totpSecretEncrypted) {
      throw new BadRequestException('2FA não está ativo.');
    }
    const secret = this.decryptSecret(user.totpSecretEncrypted);
    const result = verifySync({ token: code.trim(), secret });
    if (result.valid) {
      return;
    }

    const hashes: string[] = user.totpBackupCodesHash
      ? (JSON.parse(user.totpBackupCodesHash) as string[])
      : [];
    for (let i = 0; i < hashes.length; i++) {
      if (await bcrypt.compare(code.trim(), hashes[i])) {
        hashes.splice(i, 1);
        await this.prisma.user.update({
          where: { id: userId },
          data: { totpBackupCodesHash: JSON.stringify(hashes) },
        });
        return;
      }
    }
    throw new UnauthorizedException('Código 2FA inválido.');
  }

  isTotpEnabled(user: { totpEnabledAt: Date | null }): boolean {
    return Boolean(user.totpEnabledAt);
  }

  adminMustEnable(user: {
    role: UserRole;
    totpEnabledAt: Date | null;
    createdAt: Date;
  }): boolean {
    if (user.role !== UserRole.ADMIN) return false;
    if (user.totpEnabledAt) return false;
    if (process.env.TOTP_ADMIN_REQUIRED !== 'true') return false;
    const graceDays = Number(process.env.TOTP_ADMIN_GRACE_DAYS ?? 14);
    const graceMs = Math.max(0, graceDays) * 24 * 60 * 60 * 1000;
    return Date.now() - user.createdAt.getTime() > graceMs;
  }
}
