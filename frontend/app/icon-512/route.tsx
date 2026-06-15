import { createPwaIconResponse } from "@/lib/pwa-icon-response";

export async function GET() {
  return createPwaIconResponse({ size: 512, padding: 64, borderRadius: 96 });
}
