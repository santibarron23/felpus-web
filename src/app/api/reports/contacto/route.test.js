import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const TOKEN = "123e4567-e89b-12d3-a456-426614174000";

function request(body, auth = null) {
  return new Request("http://localhost/api/reports/contacto", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reports/contacto", () => {
  let urls;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    urls = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch({ userId = null, row = { contacto_whatsapp: "5493875885427", contacto_email: "yo@mail.com" } } = {}) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        urls.push(decodeURIComponent(String(url)));
        if (String(url).endsWith("/auth/v1/user")) return userId ? Response.json({ id: userId, email: "a@b.c" }) : new Response("", { status: 401 });
        return Response.json(row ? [row] : []);
      })
    );
  }

  it("el dueño lo lee, filtrando por su cuenta o su token en la base", async () => {
    stubFetch();
    const res = await POST(request({ reportId: "r1", pushToken: TOKEN }));
    expect(await res.json()).toEqual({ whatsapp: "5493875885427", email: "yo@mail.com" });
    expect(urls.at(-1)).toContain(`id=eq.r1&or=(push_token.eq.${TOKEN})&select=contacto_whatsapp,contacto_email`);
  });

  it("sin sesión ni token: 401; aviso ajeno: 403", async () => {
    stubFetch();
    expect((await POST(request({ reportId: "r1" }))).status).toBe(401);
    stubFetch({ userId: "otra", row: null });
    expect((await POST(request({ reportId: "r1" }, "sesion"))).status).toBe(403);
  });

  it("descarta un token con formato inválido", async () => {
    stubFetch();
    expect((await POST(request({ reportId: "r1", pushToken: "x),user_id.not.is.null,(" }))).status).toBe(401);
  });
});
