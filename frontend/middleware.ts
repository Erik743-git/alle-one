import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const USER_ID_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Legado: /rendimento/:userId (UUID) → /apontamentos/:userId */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const match = pathname.match(/^\/rendimento\/([^/]+)$/);
  if (!match) {
    return NextResponse.next();
  }
  const segment = match[1];
  if (!USER_ID_UUID.test(segment)) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = `/apontamentos/${segment}`;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/rendimento/:path*"],
};
