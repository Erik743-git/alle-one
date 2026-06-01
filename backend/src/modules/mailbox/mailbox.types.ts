import type { MailboxNotificationKind } from '@prisma/client';

export type MailboxDraft = {
  kind: MailboxNotificationKind;
  title: string;
  body: string;
  href?: string | null;
  dedupeKey: string;
  payload?: Record<string, unknown> | null;
};

export const CONTRACT_USAGE_LOW_PCT = 30;
export const CONTRACT_USAGE_HIGH_PCT = 70;
