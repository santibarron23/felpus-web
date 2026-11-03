import { describe, it, expect } from "vitest";
import { loadGoogleIdentity, generateNonce, parseGoogleClientId } from "./googleAuth";

describe("loadGoogleIdentity", () => {
  it("rechaza fuera del navegador (sin window) — mismo guard que loadLeaflet", async () => {
    // vitest.config.mjs corre estos tests en environment "node" (sin DOM),
    // así que "typeof window === 'undefined'" es real acá, no simulado.
    await expect(loadGoogleIdentity()).rejects.toThrow("no window");
  });
});

describe("generateNonce", () => {
  it("devuelve un nonce y su hash SHA-256 en hex de 64 caracteres", async () => {
    const { nonce, hashedNonce } = await generateNonce();
    expect(typeof nonce).toBe("string");
    expect(nonce.length).toBeGreaterThan(0);
    expect(hashedNonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it("genera un nonce distinto en cada llamada (no determinístico)", async () => {
    const a = await generateNonce();
    const b = await generateNonce();
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.hashedNonce).not.toBe(b.hashedNonce);
  });

  it("el hash es reproducible a partir del mismo nonce (para que Supabase pueda verificarlo)", async () => {
    const { nonce, hashedNonce } = await generateNonce();
    const recomputed = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce)))
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(recomputed).toBe(hashedNonce);
  });
});

describe("parseGoogleClientId", () => {
  const valido = "885118143352-lf4fq52h4jgkbk1q7d39bahf0b2jjus7.apps.googleusercontent.com";

  it("acepta un Client ID completo", () => {
    expect(parseGoogleClientId(valido)).toBe(valido);
  });

  it("recorta espacios y saltos de línea pegados de más", () => {
    expect(parseGoogleClientId(`  ${valido}
`)).toBe(valido);
  });

  it("rechaza el valor que estaba en producción, sin el número de proyecto (incidente 2026-11-03)", () => {
    expect(parseGoogleClientId("lf4fq52h4jgkbk1q7d39bahf0b2jjus7.apps.googleusercontent.com")).toBeNull();
  });

  it("rechaza vacío, undefined, el Client Secret u otros valores", () => {
    expect(parseGoogleClientId("")).toBeNull();
    expect(parseGoogleClientId(undefined)).toBeNull();
    expect(parseGoogleClientId("GOCSPX-abc123")).toBeNull();
    expect(parseGoogleClientId(`${valido} otro`)).toBeNull();
  });
});
