import {
  ALL_MAILBOX_KINDS,
  type MailboxNotificationKind,
} from "@/lib/services/mailbox.service";

const STORAGE_KEY = "alleone.mailbox.kindFilters";

export function loadMailboxKindFilters(): MailboxNotificationKind[] {
  if (typeof window === "undefined") return [...ALL_MAILBOX_KINDS];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...ALL_MAILBOX_KINDS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...ALL_MAILBOX_KINDS];
    const valid = parsed.filter((k): k is MailboxNotificationKind =>
      ALL_MAILBOX_KINDS.includes(k as MailboxNotificationKind),
    );
    return valid.length ? valid : [...ALL_MAILBOX_KINDS];
  } catch {
    return [...ALL_MAILBOX_KINDS];
  }
}

export function saveMailboxKindFilters(kinds: MailboxNotificationKind[]) {
  if (typeof window === "undefined") return;
  const unique = ALL_MAILBOX_KINDS.filter((k) => kinds.includes(k));
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(unique.length ? unique : ALL_MAILBOX_KINDS),
  );
}
