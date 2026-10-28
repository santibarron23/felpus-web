import { describe, it, expect } from "vitest";
import {
  seguimientoDue,
  matchEmailAllowed,
  cupoRestante,
  seguimientoEmail,
  matchEmail,
  escapeHtml,
  novedadesDue,
  EMAIL_TOPE_DIARIO,
} from "./emailAvisos";

const NOW = Date.UTC(2026, 9, 28, 12);
const hace = (dias) => new Date(NOW - dias * 864e5).toISOString();
const rep = (o = {}) => ({
  id: "r1",
  tipo: "perdida",
  especie: "perro",
  nombre: "Luna",
  color: "Negro",
  zona: "Tres Cerritos",
  ciudad: "Salta",
  contacto_email: "dueno@mail.com",
  avisos_email: true,
  resuelto: false,
  inactivo: false,
  creado_en: hace(31),
  actividad_en: hace(31),
  seguimiento_email_en: null,
  ultimo_email_match_en: null,
  ...o,
});

describe("seguimientoDue", () => {
  it("a los 30 días sin novedades, sí", () => {
    expect(seguimientoDue(rep(), NOW)).toBe(true);
    expect(seguimientoDue(rep({ actividad_en: hace(29), creado_en: hace(29) }), NOW)).toBe(false);
  });

  it("renovar (actividad_en) o un seguimiento reciente reinician la cuenta", () => {
    expect(seguimientoDue(rep({ actividad_en: hace(5) }), NOW)).toBe(false);
    expect(seguimientoDue(rep({ seguimiento_email_en: hace(10) }), NOW)).toBe(false);
    expect(seguimientoDue(rep({ creado_en: hace(70), actividad_en: hace(65), seguimiento_email_en: hace(31) }), NOW)).toBe(true);
  });

  it("nunca a reencontrados, inactivos, ocultos, dados de baja o sin email válido", () => {
    for (const o of [{ resuelto: true }, { inactivo: true }, { oculto: true }, { avisos_email: false }, { contacto_email: null }, { contacto_email: "no-es-mail" }]) {
      expect(seguimientoDue(rep(o), NOW)).toBe(false);
    }
  });
});

describe("matchEmailAllowed", () => {
  it("solo coincidencias altas", () => {
    expect(matchEmailAllowed(rep(), 0.75, NOW)).toBe(true);
    expect(matchEmailAllowed(rep(), 0.65, NOW)).toBe(false);
  });

  it("como mucho 1 por semana", () => {
    expect(matchEmailAllowed(rep({ ultimo_email_match_en: hace(3) }), 0.9, NOW)).toBe(false);
    expect(matchEmailAllowed(rep({ ultimo_email_match_en: hace(8) }), 0.9, NOW)).toBe(true);
  });

  it("respeta la baja y los cerrados", () => {
    expect(matchEmailAllowed(rep({ avisos_email: false }), 0.9, NOW)).toBe(false);
    expect(matchEmailAllowed(rep({ resuelto: true }), 0.9, NOW)).toBe(false);
    expect(matchEmailAllowed(null, 0.9, NOW)).toBe(false);
  });
});

describe("cupoRestante", () => {
  it("nunca pasa el tope diario", () => {
    expect(cupoRestante(0)).toBe(EMAIL_TOPE_DIARIO);
    expect(cupoRestante(79)).toBe(1);
    expect(cupoRestante(120)).toBe(0);
    expect(EMAIL_TOPE_DIARIO).toBeLessThan(100);
  });
});

describe("textos de los mails", () => {
  it("seguimiento: 3 botones con su acción, baja y texto plano", () => {
    const m = seguimientoEmail({ report: rep(), accionUrl: "https://felpus.com/aviso?t=TOK", bajaUrl: "https://felpus.com/aviso?t=TOK&accion=baja", now: NOW });
    expect(m.subject).toBe("¿Hubo novedades de Luna?");
    for (const a of ["volvio", "sigo", "no_busco"]) expect(m.html).toContain(`aviso?t=TOK&amp;accion=${a}`);
    expect(m.html).toContain("No quiero más avisos");
    expect(m.text).toContain("31 días");
    expect(m.text).toContain("accion=baja");
  });

  it("seguimiento de una encontrada", () => {
    expect(seguimientoEmail({ report: rep({ tipo: "encontrada", nombre: "" }), accionUrl: "u?t=1", bajaUrl: "b", now: NOW }).subject).toMatch(/^¿Pudiste devolver a /);
  });

  it("coincidencia: escapa lo que escribió otra persona", () => {
    const m = matchEmail({ report: rep(), otro: rep({ id: "r2", tipo: "encontrada", zona: '<a href="x">Centro</a>' }), score: 0.82, verUrl: "https://felpus.com/r/r2", bajaUrl: "b" });
    expect(m.subject).toBe("Puede que hayan encontrado a Luna");
    expect(m.html).toContain("82%");
    expect(m.html).not.toContain('<a href="x">');
    expect(m.html).toContain("&lt;a href=");
  });

  it("escapeHtml", () => {
    expect(escapeHtml(`<b>"y" & 'z'</b>`)).toBe("&lt;b&gt;&quot;y&quot; &amp; &#39;z&#39;&lt;/b&gt;");
    expect(escapeHtml(null)).toBe("");
  });
});


describe("novedadesDue (aviso dentro de la app)", () => {
  const r = (o = {}) => ({ id: "x", creadoEn: NOW - 31 * 864e5, resuelto: false, inactivo: false, ...o });
  it("a los 30 días, salvo que lo hayas descartado hace menos de 30", () => {
    expect(novedadesDue(r(), { now: NOW })).toBe(true);
    expect(novedadesDue(r({ creadoEn: NOW - 10 * 864e5 }), { now: NOW })).toBe(false);
    expect(novedadesDue(r(), { now: NOW, dismissedAt: NOW - 5 * 864e5 })).toBe(false);
    expect(novedadesDue(r(), { now: NOW, dismissedAt: NOW - 40 * 864e5 })).toBe(true);
  });
  it("nunca en cerrados o inactivos", () => {
    expect(novedadesDue(r({ resuelto: true }), { now: NOW })).toBe(false);
    expect(novedadesDue(r({ inactivo: true }), { now: NOW })).toBe(false);
  });
});
