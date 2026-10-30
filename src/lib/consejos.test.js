import { describe, it, expect } from "vitest";
import { AVISO_SEGURIDAD, CONSEJOS, PREGUNTAS, contextoDe, getConsejos, perfilPerro, preguntaPara, respuestaValida, tituloConsejos, tituloReencuentro } from "./consejos";

const ids = (report, ctx) => getConsejos(report, ctx).map((c) => c.id);
const perdida = (especie, detalles = {}) => ({ tipo: "perdida", especie, detalles });

describe("contextoDe", () => {
  it("según tipo, avistamiento y resuelto", () => {
    expect(contextoDe(perdida("perro"))).toBe("buscando");
    expect(contextoDe({ tipo: "encontrada", especie: "perro" })).toBe("resguardo");
    expect(contextoDe({ tipo: "encontrada", especie: "gato", detalles: { avistamiento: true } })).toBe("avistamiento");
    expect(contextoDe({ ...perdida("gato"), resuelto: true })).toBe("reencuentro");
  });
});

describe("getConsejos — gatos perdidos", () => {
  it("vive adentro: primero buscar muy cerca", () => {
    const l = ids(perdida("gato", { sale_de_casa: "interior" }));
    expect(l.slice(0, 3)).toEqual(["escondites", "silencio", "encerrado"]);
    expect(l).not.toContain("ampliar");
  });

  it("sale: primero sus recorridos y ampliar de a poco", () => {
    const l = ids(perdida("gato", { sale_de_casa: "exterior" }));
    expect(l[0]).toBe("recorridos");
    expect(l).toContain("ampliar");
    expect(l).not.toContain("encerrado");
  });

  it("sin responder o 'no sé': mezcla, empezando por lo de cerca", () => {
    for (const detalles of [{}, { sale_de_casa: "no_se" }]) {
      const l = ids(perdida("gato", detalles));
      expect(l[0]).toBe("escondites");
      expect(l).toContain("recorridos");
    }
  });

  it("nunca consejos de perro", () => {
    for (const s of ["interior", "exterior", "no_se", undefined]) {
      const l = ids(perdida("gato", { sale_de_casa: s }));
      expect(l).not.toContain("plazas");
      expect(l).not.toContain("no_perseguir_perro");
    }
  });
});

describe("getConsejos — perros perdidos", () => {
  it("sociable: plazas y comercios primero", () => {
    expect(ids(perdida("perro", { ante_desconocidos: "sociable" }))[0]).toBe("plazas");
  });

  it("miedoso: que no lo persigan, primero", () => {
    const l = ids(perdida("perro", { ante_desconocidos: "miedoso" }));
    expect(l[0]).toBe("no_perseguir_perro");
    expect(l).not.toContain("plazas");
  });

  it("sin responder o 'no sé': incluye las dos cosas", () => {
    for (const detalles of [{}, { ante_desconocidos: "no_se" }]) {
      const l = ids(perdida("perro", detalles));
      expect(l).toContain("plazas");
      expect(l).toContain("no_perseguir_perro");
    }
  });

  it("nunca consejos de gato", () => {
    for (const a of ["sociable", "miedoso", "no_se", undefined]) {
      const l = ids(perdida("perro", { ante_desconocidos: a }));
      expect(l).not.toContain("escondites");
      expect(l).not.toContain("encerrado");
    }
  });
});

describe("perfilPerro", () => {
  it("usa la respuesta guardada antes que el formulario", () => {
    expect(perfilPerro(perdida("perro", { ante_desconocidos: "sociable", comportamientos: ["miedoso"] }))).toBe("sociable");
  });

  it("deduce de los comportamientos del formulario; ante la duda, miedoso", () => {
    expect(perfilPerro(perdida("perro", { comportamientos: ["se_acerca"] }))).toBe("sociable");
    expect(perfilPerro(perdida("perro", { comportamientos: ["puede_escapar"] }))).toBe("miedoso");
    expect(perfilPerro(perdida("perro", { comportamientos: ["se_acerca", "miedoso"] }))).toBe("miedoso");
    expect(perfilPerro(perdida("perro", { comportamientos: ["no_se"] }))).toBeNull();
    expect(perfilPerro(perdida("perro"))).toBeNull();
  });
});

describe("getConsejos — otras situaciones", () => {
  it("otras especies: generales, sin consejos de perro ni gato", () => {
    const l = ids(perdida("otro"));
    expect(l).toContain("refugios_cercanos");
    for (const id of ["escondites", "encerrado", "recorridos", "plazas", "no_perseguir_perro"]) expect(l).not.toContain(id);
  });

  it("encontrada (la tiene): resguardo, con verificar a quien reclama", () => {
    const l = ids({ tipo: "encontrada", especie: "perro" });
    expect(l.slice(0, 2)).toEqual(["identificacion", "microchip"]);
    expect(l).toContain("verificar_reclamo");
  });

  it("en una veterinaria o refugio: avisar al lugar, sin consejos de tenerla en casa", () => {
    const r = { tipo: "encontrada", especie: "gato", detalles: { resguardo: "terceros", lugar: "Vete San Roque" } };
    expect(contextoDe(r)).toBe("terceros");
    const l = ids(r);
    expect(l[0]).toBe("avisar_al_lugar");
    expect(l).toContain("verificar_reclamo");
    expect(l).not.toContain("separada");
    expect(l).not.toContain("segura");
  });

  it("'conmigo' o sin respuesta: resguardo de siempre", () => {
    expect(contextoDe({ tipo: "encontrada", especie: "perro", detalles: { resguardo: "conmigo" } })).toBe("resguardo");
    expect(contextoDe({ tipo: "encontrada", especie: "perro", detalles: {} })).toBe("resguardo");
  });

  it("avistamiento: no perseguir y anotar, nunca como si la tuviera", () => {
    const l = ids({ tipo: "encontrada", especie: "gato", detalles: { avistamiento: true } });
    expect(l[0]).toBe("no_perseguir");
    expect(l).not.toContain("segura");
    expect(l).not.toContain("verificar_reclamo");
  });

  it("reencuentro de una perdida: revisión, identificación y prevención", () => {
    expect(ids({ ...perdida("perro"), resuelto: true })).toEqual(["veterinario", "chapita", "chip_prevencion", "por_donde_salio"]);
  });

  it("cada consejo tiene título y texto", () => {
    for (const [id, c] of Object.entries(CONSEJOS)) {
      expect(c.titulo, id).toBeTruthy();
      expect(c.texto, id).toBeTruthy();
    }
  });
});

describe("preguntaPara", () => {
  it("gato o perro perdido sin respuesta", () => {
    expect(preguntaPara(perdida("gato"))).toBe(PREGUNTAS.gato);
    expect(preguntaPara(perdida("perro"))).toBe(PREGUNTAS.perro);
  });

  it("no pregunta lo que ya se sabe", () => {
    expect(preguntaPara(perdida("gato", { sale_de_casa: "no_se" }))).toBeNull();
    expect(preguntaPara(perdida("perro", { comportamientos: ["se_acerca"] }))).toBeNull();
  });

  it("nada para otras especies, encontradas ni resueltas", () => {
    expect(preguntaPara(perdida("otro"))).toBeNull();
    expect(preguntaPara({ tipo: "encontrada", especie: "gato" })).toBeNull();
    expect(preguntaPara({ ...perdida("gato"), resuelto: true })).toBeNull();
  });
});

describe("respuestaValida", () => {
  it("solo claves y valores conocidos", () => {
    expect(respuestaValida("sale_de_casa", "interior")).toBe(true);
    expect(respuestaValida("ante_desconocidos", "miedoso")).toBe(true);
    expect(respuestaValida("sale_de_casa", "miedoso")).toBe(false);
    expect(respuestaValida("avistamiento", true)).toBe(false);
    expect(respuestaValida("__proto__", "interior")).toBe(false);
  });
});

describe("tituloConsejos", () => {
  it("búsqueda o reencuentro según el tipo", () => {
    expect(tituloConsejos(perdida("gato"))).toBe("Consejos para tu búsqueda");
    expect(tituloConsejos({ tipo: "encontrada", especie: "gato" })).toBe("Consejos para el reencuentro");
  });
});

describe("coincidencias", () => {
  it("mismos consejos para cualquier especie: comparar antes de confiar", () => {
    for (const r of [perdida("gato"), perdida("perro"), { tipo: "encontrada", especie: "otro" }]) {
      expect(ids(r, "coincidencia")).toEqual(["comparar_fotos", "comparar_rasgos", "comparar_zona", "pedir_detalle", "lugar_publico"]);
    }
  });

  it("ningún texto la presenta como identificación segura", () => {
    const textos = getConsejos(perdida("perro"), "coincidencia").map((c) => `${c.titulo} ${c.texto}`).join(" ");
    expect(textos).not.toMatch(/es tu mascota|seguro que|confirmad/i);
    expect(AVISO_SEGURIDAD).toMatch(/no envíes dinero ni códigos/);
  });
});

describe("tituloReencuentro", () => {
  it("según quién confirma", () => {
    expect(tituloReencuentro(perdida("gato"))).toBe("¡Qué alegría que volvió a casa!");
    expect(tituloReencuentro({ tipo: "encontrada" })).toMatch(/Volvió con su familia/);
  });
});
