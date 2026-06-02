export type NotifyVariant = "default" | "success" | "error" | "warning";

export type NotifyItem = {
  id: string;
  message: string;
  variant: NotifyVariant;
};

const MAX_VISIBLE = 5;
const DEFAULT_DURATION_MS = 6000;

let items: NotifyItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeNotify(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNotifyItems(): NotifyItem[] {
  return items;
}

export function notify(
  message: string,
  variant: NotifyVariant = "default",
  durationMs = DEFAULT_DURATION_MS,
) {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed = message.trim();
  if (!trimmed) return;

  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  items = [...items.slice(-(MAX_VISIBLE - 1)), { id, message: trimmed, variant }];
  emit();

  globalThis.setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    emit();
  }, durationMs);
}

export function notifyError(message: string) {
  notify(message, "error", 8000);
}

export function notifySuccess(message: string) {
  notify(message, "success");
}

export function notifyWarning(message: string) {
  notify(message, "warning", 7000);
}

export function dismissNotify(id: string) {
  items = items.filter((item) => item.id !== id);
  emit();
}
