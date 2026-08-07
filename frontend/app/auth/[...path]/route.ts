import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy /auth/* → API com encaminhamento correto de vários Set-Cookie
 * (alleone_access + alleone_totp_trust). Rewrites do Next podem colapsar cookies.
 */
function apiAuthBase(): string {
  return (
    process.env.API_INTERNAL_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3002"
  );
}

async function proxyAuth(
  req: NextRequest,
  pathSegments: string[],
): Promise<NextResponse> {
  const target = `${apiAuthBase()}/auth/${pathSegments.join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "set-cookie" ||
      lower === "transfer-encoding" ||
      lower === "connection" ||
      lower === "keep-alive" ||
      lower === "content-encoding" ||
      lower === "content-length"
    ) {
      return;
    }
    outHeaders.set(key, value);
  });

  const setCookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : [];
  for (const item of setCookies) {
    outHeaders.append("set-cookie", item);
  }
  if (setCookies.length === 0) {
    const single = upstream.headers.get("set-cookie");
    if (single) outHeaders.append("set-cookie", single);
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: outHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxyAuth(req, path ?? []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
