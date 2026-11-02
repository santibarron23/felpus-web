import { describe, it, expect, vi } from "vitest";
import { firmaFotos, planVectores, enTandas, vectoresConCache } from "./vectorCache";

const rep = (id, ...urls) => ({ id, fotos: urls.map((url) => ({ url })) });
const row = (id) => ({ id, hist: [1], embedding: [0.1] });

describe("firmaFotos", () => {
  it("las URLs de las fotos, en orden; sin fotos, la principal", () => {
    expect(firmaFotos(rep("a", "u1", "u2"))).toBe("u1|u2");
    expect(firmaFotos({ id: "b", foto: "u9" })).toBe("u9");
  });
});

describe("planVectores", () => {
  it("usa lo guardado si las fotos no cambiaron, pide lo nuevo y lo cambiado, y descarta lo que ya no está", () => {
    const cache = new Map([
      ["a", { firma: "u1", row: row("a") }],
      ["b", { firma: "viejo", row: row("b") }],
      ["z", { firma: "uz", row: row("z") }],
    ]);
    const plan = planVectores([rep("a", "u1"), rep("b", "u2"), rep("c", "u3")], cache);
    expect(plan.vigentes.map((r) => r.id)).toEqual(["a"]);
    expect(plan.faltan).toEqual(["b", "c"]);
    expect(plan.sobran).toEqual(["z"]);
  });

  it("sin caché pide todo", () => {
    expect(planVectores([rep("a", "u1"), rep("b", "u2")], new Map()).faltan).toEqual(["a", "b"]);
  });
});

describe("enTandas", () => {
  it("parte la lista", () => {
    expect(enTandas([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(enTandas([], 2)).toEqual([]);
  });
});

describe("vectoresConCache", () => {
  it("segunda visita: no pide nada a la red", async () => {
    const reports = [rep("a", "u1"), rep("b", "u2")];
    const store = new Map();
    const io = {
      leerCache: async () => new Map(store),
      escribirCache: async (guardar, borrar) => {
        for (const g of guardar) store.set(g.id, { firma: g.firma, row: g.row });
        for (const id of borrar) store.delete(id);
      },
    };
    const fetchIds = vi.fn(async (ids) => ids.map(row));

    const primera = await vectoresConCache(reports, fetchIds, io);
    expect(primera.pedidos).toBe(2);
    expect(primera.rows.map((r) => r.id).sort()).toEqual(["a", "b"]);

    const segunda = await vectoresConCache(reports, fetchIds, io);
    expect(segunda.pedidos).toBe(0);
    expect(fetchIds).toHaveBeenCalledTimes(1);
    expect(segunda.rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("un aviso nuevo: pide solo ese", async () => {
    const store = new Map([["a", { firma: "u1", row: row("a") }]]);
    const io = { leerCache: async () => new Map(store), escribirCache: async () => {} };
    const fetchIds = vi.fn(async (ids) => ids.map(row));
    const r = await vectoresConCache([rep("a", "u1"), rep("n", "u5")], fetchIds, io);
    expect(fetchIds).toHaveBeenCalledWith(["n"]);
    expect(r.pedidos).toBe(1);
  });

  it("sin IndexedDB (caché vacía que no guarda) baja todo, como antes", async () => {
    const io = { leerCache: async () => new Map(), escribirCache: async () => {} };
    const r = await vectoresConCache([rep("a", "u1")], async (ids) => ids.map(row), io);
    expect(r.rows).toHaveLength(1);
  });
});
