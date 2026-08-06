import { describe, it, expect } from "vitest";
import { loadGoogleIdentity, generateNonce } from "./googleAuth";

describe("loadGoogleIdentity", () => {
  it("rechaza fuera del navegador (sin window) — mismo guard que loadGoogleMaps", async () => {
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
