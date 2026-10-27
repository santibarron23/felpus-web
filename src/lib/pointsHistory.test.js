import { describe, it, expect } from "vitest";
import { parseReferrer, storedReferrer, referralLink, eventLabel, groupByDay, dayLabel, pointsToday } from "./pointsHistory";

const ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

describe("referidos", () => {
  it("parseReferrer: solo acepta un id válido", () => {
    expect(parseReferrer(`?invita=${ID}`)).toBe(ID);
    expect(parseReferrer(`?invita=${ID.toUpperCase()}`)).toBe(ID);
    expect(parseReferrer("?invita=hola")).toBeNull();
    expect(parseReferrer("?r=123")).toBeNull();
    expect(parseReferrer("")).toBeNull();
  });
  it("storedReferrer: vence a los 30 días y tolera basura", () => {
    const now = Date.now();
    expect(storedReferrer(JSON.stringify({ id: ID, at: now - 1000 }), now)).toBe(ID);
    expect(storedReferrer(JSON.stringify({ id: ID, at: now - 31 * 24 * 3600 * 1000 }), now)).toBeNull();
    expect(storedReferrer("{no es json", now)).toBeNull();
    expect(storedReferrer(null, now)).toBeNull();
  });
  it("referralLink", () => {
    expect(referralLink("https://felpus.com", ID)).toBe(`https://felpus.com/?invita=${ID}`);
  });
});

describe("historial", () => {
  const now = new Date(2026, 9, 27, 18, 0);
  const at = (d, h = 12) => new Date(2026, 9, d, h).toISOString();

  it("eventLabel por motivo", () => {
    expect(eventLabel({ reason: "reporte", tipo: "perdida" })).toBe("Publicaste una mascota perdida");
    expect(eventLabel({ reason: "reporte", tipo: "encontrada" })).toBe("Publicaste una mascota encontrada");
    expect(eventLabel({ reason: "reencuentro" })).toBe("Confirmaste un reencuentro");
    expect(eventLabel({ reason: "referido" })).toMatch(/Invitaste/);
    expect(eventLabel({ reason: "otro" })).toBe("Huellitas");
  });

  it("groupByDay: Hoy, Ayer y fecha larga", () => {
    const groups = groupByDay(
      [
        { reason: "reporte", points: 10, created_at: at(27, 15) },
        { reason: "reporte", points: 15, created_at: at(27, 9) },
        { reason: "reencuentro", points: 50, created_at: at(26) },
        { reason: "reporte", points: 10, created_at: at(23) },
      ],
      now
    );
    expect(groups.map((g) => g.label)).toEqual(["Hoy", "Ayer", dayLabel(new Date(2026, 9, 23), now)]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[2].label).toMatch(/23 de octubre/);
  });

  it("pointsToday suma solo lo de hoy", () => {
    expect(
      pointsToday(
        [
          { points: 10, created_at: at(27) },
          { points: 20, created_at: at(27, 8) },
          { points: 50, created_at: at(26) },
        ],
        now
      )
    ).toBe(30);
  });
});
