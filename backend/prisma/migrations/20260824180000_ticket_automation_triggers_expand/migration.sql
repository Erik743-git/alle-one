-- Expandir gatilhos de automação de ticket (estilo TiFlux).
ALTER TYPE "TicketAutomationTrigger" ADD VALUE IF NOT EXISTS 'TICKET_OPENED';
ALTER TYPE "TicketAutomationTrigger" ADD VALUE IF NOT EXISTS 'TICKET_IDLE';
ALTER TYPE "TicketAutomationTrigger" ADD VALUE IF NOT EXISTS 'TICKET_NEW_REPLY';
