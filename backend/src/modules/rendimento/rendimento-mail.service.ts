import { Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service';

export type AppointmentQuestionMailPayload = {
  companyName: string;
  ticketNumber: number;
  appointmentDate: string;
  userName: string | null;
  message: string;
  questionedByName: string;
  adminEmails: string[];
  companyId: string;
};

@Injectable()
export class RendimentoMailService {
  constructor(private readonly mail: MailService) {}

  async notifyAdminsAppointmentQuestion(payload: AppointmentQuestionMailPayload) {
    const uniqueEmails = Array.from(
      new Set(payload.adminEmails.map((e) => e.trim().toLowerCase())),
    ).filter(Boolean);

    if (!uniqueEmails.length) return;

    const portalUrl = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
    const link = `${portalUrl}/apontamentos/empresa/${payload.companyId}`;
    const subject = `[Apontamentos] Questionamento — ${payload.companyName}`;
    const who = payload.userName ?? '—';
    const text = [
      `Um cliente questionou um apontamento (justificativa obrigatória anexa).`,
      ``,
      `Empresa: ${payload.companyName}`,
      `Ticket: #${payload.ticketNumber}`,
      `Data: ${payload.appointmentDate}`,
      `Atendente: ${who}`,
      `Questionado por: ${payload.questionedByName}`,
      ``,
      `Mensagem:`,
      payload.message,
      ``,
      `Acesse: ${link}`,
    ].join('\n');

    await this.mail.sendMail({
      to: uniqueEmails,
      subject,
      text,
      html: `<p>Um cliente questionou um apontamento.</p>
<ul>
<li><strong>Empresa:</strong> ${payload.companyName}</li>
<li><strong>Ticket:</strong> #${payload.ticketNumber}</li>
<li><strong>Data:</strong> ${payload.appointmentDate}</li>
<li><strong>Atendente:</strong> ${who}</li>
<li><strong>Questionado por:</strong> ${payload.questionedByName}</li>
</ul>
<p><strong>Mensagem:</strong><br/>${payload.message.replace(/\n/g, '<br/>')}</p>
<p><a href="${link}">Abrir agenda empresarial</a></p>`,
    });
  }
}
