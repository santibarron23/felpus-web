import { describe, it, expect } from "vitest";
import { dictationErrorMessage } from "./dictation";

describe("dictationErrorMessage", () => {
  it("explica cómo habilitar el micrófono si el permiso está bloqueado", () => {
    expect(dictationErrorMessage("not-allowed")).toMatch(/permiso para usar el micrófono/);
    expect(dictationErrorMessage("service-not-allowed")).toMatch(/micrófono/);
  });
  it("mensajes específicos para silencio, sin micrófono y sin conexión", () => {
    expect(dictationErrorMessage("no-speech")).toMatch(/No escuchamos nada/);
    expect(dictationErrorMessage("audio-capture")).toMatch(/micrófono disponible/);
    expect(dictationErrorMessage("network")).toMatch(/conexión/);
  });
  it("si la persona lo frena no avisa nada; lo desconocido cae al genérico", () => {
    expect(dictationErrorMessage("aborted")).toBeNull();
    expect(dictationErrorMessage("algo-raro")).toMatch(/No pudimos escuchar bien/);
  });
});
