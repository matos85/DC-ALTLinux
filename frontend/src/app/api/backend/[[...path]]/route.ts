import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const targetBase = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";

const hopByHop = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function targetUrl(pathSegments: string[], search: string) {
  const base = targetBase.replace(/\/$/, "");
  const path = pathSegments.length ? pathSegments.join("/") : "";
  // Django urlpatterns используют завершающий слэш; без него PATCH/POST с телом ломаются (APPEND_SLASH).
  const suffix = path ? `${path}/` : "";
  return `${base}/api/${suffix}${search}`;
}

async function proxy(req: NextRequest, pathSegments: string[]) {
  const url = new URL(req.url);
  const target = targetUrl(pathSegments, url.search);
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || hopByHop.has(lower)) {
      return;
    }
    headers.set(key, value);
  });

  const method = req.method;
  const body =
    method === "GET" || method === "HEAD" || method === "OPTIONS" ? undefined : await req.arrayBuffer();

  const upstream = await fetch(target, { method, headers, body });

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (hopByHop.has(key.toLowerCase())) {
      return;
    }
    outHeaders.append(key, value);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function HEAD(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function OPTIONS(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}
