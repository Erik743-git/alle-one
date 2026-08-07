import { Injectable } from '@nestjs/common';
import { EmailTemplatesService } from '../../mail/email-templates.service';

export type GmudPendingApprovalMailPayload = {
  gmudId: string;
  gmudCode: number;
  companyId: string;
  companyName: string;
  approverEmails: string[];
};

@Injectable()
export class GmudMailService {
  constructor(private readonly templates: EmailTemplatesService) {}

  async notifyApproversGmudPendingApproval(
    payload: GmudPendingApprovalMailPayload,
  ) {
    const uniqueEmails = Array.from(
      new Set(payload.approverEmails.map((e) => e.trim())),
    ).filter(Boolean);

    if (!uniqueEmails.length) {
      return;
    }

    await this.templates.sendGmudNotify({
      to: uniqueEmails,
      gmudCode: payload.gmudCode,
      gmudId: payload.gmudId,
      companyName: payload.companyName,
    });
  }
}
