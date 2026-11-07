import { describe, expect, it, vi } from "vitest";
import { borrarArchivos, esAvatarDe, esFotoDelAviso, firmarSubida, pathDesdeUrl, prefijoPermitido } from "./serverFotos";

const USER = "11111111-2222-3333-4444-555555555555";
const OTRO = "99999999-2222-3333-4444-555555555555";
const BASE = "https://p.supabase.co/storage/v1/object/public/felpus-photos/";

describe("prefijoPermitido", () => {
  it("acepta los prefijos de aviso que arma la app", () => {
    for (const p of ["1730000000000-abc123", "1730000000000-abc123-0", "1730000000000-abc123-r"]) {
      expect(prefijoPermitido(p, null)).toBe(p);
    }
  });
  it("rechaza carpetas, puntos y cosas raras", () => {
    for (const p of ["../x", "a/b", "a.b", "", "x".repeat(81), null, 3]) expect(prefijoPermitido(p, USER)).toBeNull();
  });
  it("foto de perfil: solo en la carpeta de la propia cuenta", () => {
    expect(prefijoPermitido(`avatars/${USER}/avatar`, USER)).toBe(`avatars/${USER}/avatar`);
    expect(prefijoPermitido(`avatars/${OTRO}/avatar`, USER)).toBeNull();
    expect(prefijoPermitido(`avatars/${USER}/avatar`, null)).toBeNull();
  });
});

describe("pathDesdeUrl y pertenencia", () => {
  it("saca el path de una URL pública del bucket", () => {
    expect(pathDesdeUrl(`${BASE}r1-0-uuid.jpg`)).toBe("r1-0-uuid.jpg");
    expect(pathDesdeUrl(`${BASE}avatars/${USER}/avatar-u.jpg?v=1`)).toBe(`avatars/${USER}/avatar-u.jpg`);
    expect(pathDesdeUrl("https://otro.com/x.jpg")).toBeNull();
    expect(pathDesdeUrl(`${BASE}..%2Fx`)).toBeNull();
  });
  it("una foto es del aviso solo si empieza con su id y un guion", () => {
    expect(esFotoDelAviso("170-abc-0-u.jpg", "170-abc")).toBe(true);
    expect(esFotoDelAviso("170-abcd-0-u.jpg", "170-abc")).toBe(false);
    expect(esFotoDelAviso("avatars/170-abc-u.jpg", "170-abc")).toBe(false);
  });
  it("un avatar es de la cuenta solo dentro de su carpeta", () => {
    expect(esAvatarDe(`avatars/${USER}/avatar-u.jpg`, USER)).toBe(true);
    expect(esAvatarDe(`avatars/${OTRO}/avatar-u.jpg`, USER)).toBe(false);
    expect(esAvatarDe(`avatars/${USER}/a/b.jpg`, USER)).toBe(false);
  });
});

describe("llamadas a Storage", () => {
  const env = { supabaseUrl: "https://p.supabase.co", serviceKey: "service" };
  it("firmarSubida pide el permiso con la service key y devuelve el token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ url: "/object/upload/sign/felpus-photos/r1-u.jpg?token=TKN" })));
    await expect(firmarSubida("r1-u.jpg", { ...env, fetchImpl })).resolves.toEqual({ path: "r1-u.jpg", token: "TKN" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://p.supabase.co/storage/v1/object/upload/sign/felpus-photos/r1-u.jpg");
    expect(init.headers.Authorization).toBe("Bearer service");
  });
  it("firmarSubida falla si Storage no contesta bien", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 400 }));
    await expect(firmarSubida("r1-u.jpg", { ...env, fetchImpl })).rejects.toThrow();
  });
  it("borrarArchivos manda los paths y no llama si no hay nada", async () => {
    const fetchImpl = vi.fn(async () => new Response("[]"));
    await borrarArchivos([], { ...env, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    await borrarArchivos(["r1-u.jpg"], { ...env, fetchImpl });
    expect(fetchImpl.mock.calls[0][1].method).toBe("DELETE");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ prefixes: ["r1-u.jpg"] });
  });
});
