import { describe, expect, it } from "vitest";
import { rowsToCsv, usersReportToCsv } from "./csv";

describe("rowsToCsv", () => {
  it("arma el header y las filas separados por coma y CRLF", () => {
    expect(rowsToCsv(["A", "B"], [["1", "2"], ["3", "4"]])).toBe("A,B\r\n1,2\r\n3,4");
  });

  it("entrecomilla un campo que tiene una coma", () => {
    expect(rowsToCsv(["Nombre"], [["Pérez, Juan"]])).toBe('Nombre\r\n"Pérez, Juan"');
  });

  it("entrecomilla y escapa un campo con comillas dobles", () => {
    expect(rowsToCsv(["Nombre"], [['Juan "el rápido" Pérez']])).toBe('Nombre\r\n"Juan ""el rápido"" Pérez"');
  });

  it("entrecomilla un campo con salto de línea", () => {
    expect(rowsToCsv(["Nota"], [["línea 1\nlínea 2"]])).toBe('Nota\r\n"línea 1\nlínea 2"');
  });

  it("trata null/undefined como campo vacío", () => {
    expect(rowsToCsv(["A"], [[null], [undefined]])).toBe("A\r\n\r\n");
  });

  it("no rompe con cero filas", () => {
    expect(rowsToCsv(["A", "B"], [])).toBe("A,B");
  });
});

describe("usersReportToCsv", () => {
  it("arma el CSV con apodo/email/whatsapp de cada usuario", () => {
    const users = [
      { id: "1", email: "a@x.com", nickname: "Ana", whatsapp: "+5491100000000" },
      { id: "2", email: "b@x.com", nickname: "Beto", whatsapp: null },
    ];
    expect(usersReportToCsv(users)).toBe(
      "Apodo,Email,WhatsApp\r\nAna,a@x.com,+5491100000000\r\nBeto,b@x.com,"
    );
  });

  it("usa '(sin apodo)' si nickname es null", () => {
    const users = [{ id: "1", email: "a@x.com", nickname: null, whatsapp: null }];
    expect(usersReportToCsv(users)).toBe("Apodo,Email,WhatsApp\r\n(sin apodo),a@x.com,");
  });

  it("devuelve solo el header con una lista vacía", () => {
    expect(usersReportToCsv([])).toBe("Apodo,Email,WhatsApp");
  });

  it("no rompe con undefined", () => {
    expect(usersReportToCsv(undefined)).toBe("Apodo,Email,WhatsApp");
  });
});
