import { describe, it, expect } from "vitest";
import { shareCardData, fechaCorta, buildShareMessage, whatsappUrl } from "./shareCard";

const NOW = new Date("2026-10-27T12:00:00-03:00");

describe("fechaCorta", () => {
  it("día y mes, sin año si es el año en curso", () => {
    expect(fechaCorta("2026-10-05", NOW)).toBe("5 de octubre");
    expect(fechaCorta("2025-12-31", NOW)).toBe("31 de diciembre de 2025");
    expect(fechaCorta("2026-10-27T11:12:57+00:00", NOW)).toBe("27 de octubre");
  });
  it("vacío o inválido: cadena vacía", () => {
    expect(fechaCorta("", NOW)).toBe("");
    expect(fechaCorta("ayer", NOW)).toBe("");
    expect(fechaCorta("2026-13-01", NOW)).toBe("");
  });
});

describe("shareCardData", () => {
  it("perdida con nombre: el nombre de título y la descripción abajo", () => {
    const d = shareCardData(
      { tipo: "perdida", especie: "perro", sexo: "Macho", nombre: "Toby", color: "Negro", tamano: "Chico", zona: "Centro", ciudad: "Salta", fecha: "2026-10-20" },
      NOW
    );
    expect(d.estado).toBe("perdida");
    expect(d.badge).toBe("SE BUSCA");
    expect(d.title).toBe("Toby");
    expect(d.subtitle).toBe("Perro negro, tamaño chico");
    expect(d.zona).toBe("Centro, Salta");
    expect(d.cuando).toBe("Se perdió el 20 de octubre");
    expect(d.cta).toBe("¿Lo viste? Avisá en felpus.com");
  });
  it("encontrada concuerda con el sexo", () => {
    const d = shareCardData({ tipo: "encontrada", especie: "gato", sexo: "Hembra", color: "Blanco", zona: "Tres Cerritos", fecha: "2026-10-25" }, NOW);
    expect(d.badge).toBe("ENCONTRADA");
    expect(d.title).toBe("Gata blanca");
    expect(d.cuando).toBe("Encontrada el 25 de octubre");
    expect(d.cta).toBe("¿Es tuya? Contactá en felpus.com");
  });
  it("resuelto: volvió a casa, en verde", () => {
    const d = shareCardData({ tipo: "perdida", especie: "perro", resuelto: true, nombre: "Luna", fecha: "2026-10-01" }, NOW);
    expect(d.estado).toBe("reencontrada");
    expect(d.badge).toBe("¡VOLVIÓ A CASA!");
    expect(d.accent).toBe("#2F7955");
  });
  it("no repite zona y ciudad iguales, y recorta textos largos", () => {
    const d = shareCardData({ tipo: "perdida", zona: "Salta", ciudad: "Salta", nombre: "N".repeat(80) }, NOW);
    expect(d.zona).toBe("Salta");
    expect(d.title.length).toBeLessThanOrEqual(42);
    expect(d.title.endsWith("…")).toBe(true);
  });
  it("sin datos no rompe", () => {
    const d = shareCardData({}, NOW);
    expect(d.badge).toBe("SE BUSCA");
    expect(d.title).toBeTruthy();
    expect(d.cuando).toBe("");
  });
});

describe("buildShareMessage", () => {
  it("corto: qué, dónde, cuándo y qué hacer", () => {
    const m = buildShareMessage({ tipo: "perdida", especie: "perro", nombre: "Toby", zona: "Centro", fecha: "2026-10-20" }, NOW);
    expect(m).toBe("🔴 SE BUSCA: Toby\n📍 Centro\nSe perdió el 20 de octubre\n¿Lo viste? Avisá 👇");
  });
});

describe("whatsappUrl", () => {
  it("usa api.whatsapp.com (wa.me rompe los emojis) y codifica bien los de 4 bytes", () => {
    const url = whatsappUrl("🔴 SE BUSCA\n📍 San Lorenzo 👇");
    expect(url.startsWith("https://api.whatsapp.com/send?text=")).toBe(true);
    expect(url).toContain("%F0%9F%94%B4");
    expect(url).not.toContain("wa.me");
    expect(decodeURIComponent(url.split("text=")[1])).toBe("🔴 SE BUSCA\n📍 San Lorenzo 👇");
  });

  it("con número, solo los dígitos", () => {
    expect(whatsappUrl("Hola", "+54 9 387 412-3456")).toBe("https://api.whatsapp.com/send?phone=5493874123456&text=Hola");
  });
});
