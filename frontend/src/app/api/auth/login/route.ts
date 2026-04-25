import { NextResponse } from "next/server";

function backendApiBase() {
  const internal = process.env.INTERNAL_API_URL?.replace(/\/$/, "");
  const pub = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  return internal || pub || "http://localhost:8000/api";
}

function detailFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Не удалось войти. Проверьте имя пользователя и пароль.";
  }
  const d = (payload as { detail?: unknown }).detail;
  if (typeof d === "string") {
    return d;
  }
  if (Array.isArray(d)) {
    return d.map(String).join(", ");
  }
  return "Не удалось войти. Проверьте имя пользователя и пароль.";
}

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false as const, detail: "Неверный формат запроса." }, { status: 200 });
  }

  const base = backendApiBase();
  const upstream = await fetch(`${base}/auth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: body.username ?? "",
      password: body.password ?? "",
    }),
  });

  const raw = await upstream.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      payload = { detail: raw };
    }
  }

  if (!upstream.ok || !payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false as const, detail: detailFromPayload(payload) }, { status: 200 });
  }

  const data = payload as { access?: string; refresh?: string };
  if (!data.access || !data.refresh) {
    return NextResponse.json({ ok: false as const, detail: detailFromPayload(payload) }, { status: 200 });
  }

  return NextResponse.json({
    ok: true as const,
    access: data.access,
    refresh: data.refresh,
  });
}
