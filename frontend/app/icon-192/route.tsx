import { createPwaIconResponse } from "@/lib/pwa-icon-response";

export async function GET() {
  return createPwaIconResponse({ size: 192, padding: 24, borderRadius: 32 });
}
