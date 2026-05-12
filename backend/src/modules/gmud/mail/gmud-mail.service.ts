import { Injectable } from '@nestjs/common';
import { MailService } from '../../mail/mail.service';

export type GmudPendingApprovalMailPayload = {
  gmudId: string;
  gmudCode: number;
  companyId: string;
  companyName: string;
  approverEmails: string[];
};

@Injectable()
export class GmudMailService {
  constructor(private readonly mail: MailService) {}

  async notifyApproversGmudPendingApproval(
    payload: GmudPendingApprovalMailPayload,
  ) {
    const uniqueEmails = Array.from(
      new Set(payload.approverEmails.map((e) => e.trim())),
    ).filter(Boolean);

    if (!uniqueEmails.length) {
      return;
    }

    const subject = `GMUD #${payload.gmudCode} aguardando aprovação`;
    const portalUrl = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
    const link = `${portalUrl}/gmud/${payload.gmudId}`;

    const text = `A GMUD #${payload.gmudCode} está aguardando sua aprovação.\n\nEmpresa: ${payload.companyName}\n\nAcesse: ${link}\n`;

    await this.mail.sendMail({
      to: uniqueEmails,
      subject,
      text,
      html: `<p>A GMUD <strong>#${payload.gmudCode}</strong> está aguardando sua aprovação.</p><p><strong>Empresa:</strong> ${payload.companyName}</p><p><a href="${link}">Acessar GMUD no portal</a></p>`,
    });
  }
}
