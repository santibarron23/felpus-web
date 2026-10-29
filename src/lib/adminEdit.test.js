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
