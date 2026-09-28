-- Correio: aviso ao solicitante quando outra pessoa abre um chamado para ele,
-- e ao novo responsável. Só acrescenta dois valores ao enum.
ALTER TYPE "MailboxNotificationKind" ADD VALUE IF NOT EXISTS 'TICKET_ABERTO_PARA_VOCE';
ALTER TYPE "MailboxNotificationKind" ADD VALUE IF NOT EXISTS 'TICKET_NOVO_RESPONSAVEL';
