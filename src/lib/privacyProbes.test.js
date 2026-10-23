import { describe, it, expect, vi } from "vitest";
import { PRIVACY_PROBES, probeLeaked, runPrivacyProbes } from "./privacyProbes";

describe("probeLeaked", () => {
  it("permiso denegado no es filtración", () => {
    expect(probeLeaked(401, { message: "permission denied" })).toBe(false);
    expect(probeLeaked(400, null)).toBe(false);
  });
  it("lista vacía no es filtración", () => {
    expect(probeLeaked(200, [])).toBe(false);
  });
  it("200 con datos sí es filtración", () => {
    expect(probeLeaked(200, [{ whatsapp: "+549..." }])).toBe(true);
  });
});

describe("runPrivacyProbes", () => {
  it("reporta solo las lecturas que devolvieron datos", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const leaked = url.includes("contributors?select=whatsapp");
      return { status: leaked ? 200 : 401, json: async () => (leaked ? [{ whatsapp: "x" }] : { message: "denied" }) };
    });
    expect(await runPrivacyProbes("https://x.supabase.co", "anon", fetchImpl)).toEqual(["contributors.whatsapp"]);
    expect(fetchImpl).toHaveBeenCalledTimes(PRIVACY_PROBES.length);
  });

  it("un error de red no cuenta como filtración", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await runPrivacyProbes("https://x.supabase.co", "anon", fetchImpl)).toEqual([]);
  });
});
