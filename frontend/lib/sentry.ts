export function initFrontendSentry() {
  // Prefer sentry.client.config.ts (@sentry/nextjs). Kept for callers that import this helper.
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return;
}
