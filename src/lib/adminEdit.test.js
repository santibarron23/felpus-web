import { describe, it, expect } from "vitest";
import { buildAdminPatch, reorderPhotos } from "./adminEdit";

describe("buildAdminPatch", () => {
  it("acepta campos válidos y recorta espacios", () => {
    const { patch } = buildAdminPatch({ nombre: " Morena ", zona: "Tres Cerritos", tipo: "encontrada", tamano: "chico", sexo: "" });
    expect(patch).toEqual({ nombre: "Morena", zona: "Tres Cerritos", tipo: "encontrada", tamano: "chico", sexo: null });
  });
  it("ignora campos que no se pueden editar", () => {
    const { patch } = buildAdminPatch({ user_id: "x", resuelto: true, contacto_whatsapp: "1", push_token: "t", nombre: "A" });
    expect(patch).toEqual({ nombre: "A" });
  });
  it("rechaza valores fuera de las opciones o demasiado largos", () => {
    expect(buildAdminPatch({ tipo: "robada" }).error).toBeTruthy();
    expect(buildAdminPatch({ color: "Fucsia" }).error).toBeTruthy();
    expect(buildAdminPatch({ nombre: "x".repeat(61) }).error).toBeTruthy();
    expect(buildAdminPatch({ zona: "  " }).error).toBeTruthy();
    expect(buildAdminPatch({ fecha: "20/10/2026" }).error).toBeTruthy();
  });
  it("vaciar un texto opcional lo deja en null", () => {
    expect(buildAdminPatch({ raza: "" }).patch).toEqual({ raza: null });
  });
});

describe("reorderPhotos", () => {
  const row = {
    foto_url: "a",
    foto_urls: ["a", "b", "c"],
    hists: [[1], [2], [3]],
    hist: [1],
    embeddings: [null, [0.2], null],
    embedding: null,
  };
  it("mueve URL, histograma y embedding juntos y cambia la principal", () => {
    const { patch } = reorderPhotos(row, ["c", "a", "b"]);
    expect(patch).toEqual({
      foto_urls: ["c", "a", "b"],
      foto_url: "c",
      hists: [[3], [1], [2]],
      hist: [3],
      embeddings: [null, null, [0.2]],
      embedding: null,
    });
  });
  it("no deja agregar, sacar ni repetir fotos", () => {
    expect(reorderPhotos(row, ["a", "b"]).error).toBeTruthy();
    expect(reorderPhotos(row, ["a", "b", "x"]).error).toBeTruthy();
    expect(reorderPhotos(row, ["a", "a", "b"]).error).toBeTruthy();
  });
  it("con una sola foto no cambia nada", () => {
    expect(reorderPhotos({ foto_url: "a", foto_urls: null }, ["a"]).patch).toEqual({});
  });
});

describe("buildOwnerPatch", () => {
  it("mismos campos que el admin, menos el tipo", async () => {
    const { buildOwnerPatch } = await import("./adminEdit");
    expect(buildOwnerPatch({ nombre: "Luna", zona: "Centro" }).patch).toEqual({ nombre: "Luna", zona: "Centro" });
    expect(buildOwnerPatch({ tipo: "encontrada" }).error).toBeTruthy();
    expect(buildOwnerPatch({ contacto_email: "x@y.z", nombre: "A" }).patch).toEqual({ nombre: "A" });
  });
});

describe("rebuildPhotos", async () => {
  const { rebuildPhotos } = await import("./adminEdit");
  const B = "https://x.supabase.co/storage/v1/object/public/felpus-photos/";
  const row = {
    foto_url: `${B}r1-0-a.jpg`,
    foto_urls: [`${B}r1-0-a.jpg`, `${B}r1-1-b.jpg`, `${B}r1-2-c.jpg`],
    hists: [[1], [2], [3]],
    hist: [1],
    embeddings: [[0.1], [0.2], [0.3]],
    embedding: [0.1],
    detalles: { accesorios: ["collar"], fotos_dudosas: [1] },
  };
  const [a, b, c] = row.foto_urls;
  const prefijo = `${B}r1-`;

  it("sacar una foto: corre los datos y la marca de dudosa con su foto", () => {
    const { patch, quitadas } = rebuildPhotos(row, [{ url: a }, { url: b }]);
    expect(patch.foto_urls).toEqual([a, b]);
    expect(patch.hists).toEqual([[1], [2]]);
    expect(patch.detalles).toEqual({ accesorios: ["collar"], fotos_dudosas: [1] });
    expect(quitadas).toEqual([c]);
  });

  it("reordenar mueve la marca de dudosa (antes quedaba en la foto equivocada)", () => {
    const { patch } = rebuildPhotos(row, [{ url: b }, { url: a }, { url: c }]);
    expect(patch.foto_url).toBe(b);
    expect(patch.embedding).toEqual([0.2]);
    expect(patch.detalles.fotos_dudosas).toEqual([0]);
  });

  it("reemplazar por una recortada: la nueva no es dudosa y la vieja se borra", () => {
    const nueva = `${B}r1-r-123e4567-e89b-12d3-a456-426614174000.jpg`;
    const { patch, quitadas } = rebuildPhotos(row, [{ url: a }, { url: nueva, hist: [9], embedding: [0.9] }, { url: c }], { nuevaPrefijo: prefijo });
    expect(patch.foto_urls).toEqual([a, nueva, c]);
    expect(patch.hists[1]).toEqual([9]);
    expect(patch.detalles).toEqual({ accesorios: ["collar"] });
    expect(quitadas).toEqual([b]);
  });

  it("no acepta fotos de afuera, de otro reporte, vacías ni de más", () => {
    expect(rebuildPhotos(row, [{ url: "https://evil.example/x.jpg", hist: [1] }], { nuevaPrefijo: prefijo }).error).toBeTruthy();
    expect(rebuildPhotos(row, [{ url: `${B}otro-r-x.jpg` }], { nuevaPrefijo: prefijo }).error).toBeTruthy();
    expect(rebuildPhotos(row, [{ url: `${B}r1-r-x.jpg` }]).error).toBeTruthy(); // sin prefijo no hay fotos nuevas
    expect(rebuildPhotos(row, []).error).toBeTruthy();
    expect(rebuildPhotos(row, [{ url: a }, { url: a }]).error).toBeTruthy();
    expect(rebuildPhotos(row, [1, 2, 3, 4].map((n) => ({ url: `${B}r1-n${n}.jpg` })), { nuevaPrefijo: prefijo }).error).toBeTruthy();
    expect(rebuildPhotos(row, [{ url: `${B}r1-r-x.jpg`, hist: ["mal"] }], { nuevaPrefijo: prefijo }).error).toBeTruthy();
  });

  it("sin cambios no devuelve nada para guardar", () => {
    expect(rebuildPhotos(row, row.foto_urls.map((url) => ({ url })))).toEqual({ patch: {}, quitadas: [] });
  });
});
