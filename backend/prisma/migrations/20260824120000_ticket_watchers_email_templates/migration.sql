-- Watchers (CC) de tickets + templates de e-mail parametrizados

CREATE TABLE IF NOT EXISTS "portal_ticket_watchers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_number" INTEGER NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "portal_ticket_watchers_ticket_email_key" UNIQUE ("ticket_number", "email")
);

CREATE INDEX IF NOT EXISTS "portal_ticket_watchers_ticket_number_idx"
  ON "portal_ticket_watchers"("ticket_number");

CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" VARCHAR(64) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "subject" VARCHAR(500) NOT NULL,
  "body_html" TEXT NOT NULL,
  "body_text" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_templates_key_key" UNIQUE ("key")
);

INSERT INTO "email_templates" ("id", "key", "name", "subject", "body_html", "body_text", "created_at", "updated_at")
VALUES
(
  gen_random_uuid(),
  'TICKET_REGISTERED',
  'Chamado registrado',
  'Seu chamado foi registrado com o numero {{ticketNumber}}',
  '<p>Olá {{requestorName}} da empresa {{companyName}}.</p><p>Recebemos sua solicitação de atendimento.</p><p><strong>#{{ticketNumber}} - {{title}}</strong></p><p>Data/hora de abertura: {{openedAt}}</p><p>Nossa equipe está trabalhando para realizar seu atendimento o mais rápido possível.</p><p>Atenciosamente.<br/>Alle Tecnologia.</p>',
  'Olá {{requestorName}} da empresa {{companyName}}.\n\nRecebemos sua solicitação de atendimento.\n\n#{{ticketNumber}} - {{title}}\nData/hora de abertura: {{openedAt}}\n\nNossa equipe está trabalhando para realizar seu atendimento o mais rápido possível.\n\nAtenciosamente.\nAlle Tecnologia.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  gen_random_uuid(),
  'GMUD_NOTIFY',
  'GMUD aguardando aprovação',
  'GMUD #{{gmudCode}} aguardando aprovação',
  '<p>A GMUD <strong>#{{gmudCode}}</strong> está aguardando sua aprovação.</p><p><strong>Empresa:</strong> {{companyName}}</p><p><a href="{{gmudLink}}">Acessar GMUD no portal</a></p>',
  'A GMUD #{{gmudCode}} está aguardando sua aprovação.\n\nEmpresa: {{companyName}}\n\nAcesse: {{gmudLink}}\n',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
