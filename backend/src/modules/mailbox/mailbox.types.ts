import type { MailboxNotificationKind } from '@prisma/client';

export type MailboxDraft = {
  kind: MailboxNotificationKind;
  title: string;
  body: string;
  href?: string | null;
  dedupeKey: string;
  payload?: Record<string, unknown> | null;
};
