import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./push";

// La public key VAPID llega en base64url (RFC 4648 §5: "-"/"_" en vez de
// "+"/"/", sin padding "=") — el formato que devuelve web-push y que se
// guarda en NEXT_PUBLIC_VAPID_PUBLIC_KEY — pero pushManager.subscribe()
// necesita un Uint8Array real. Vectores generados con Buffer de Node
// (fuente independiente de la implementación) para no validar la función
// contra sí misma.
describe("urlBase64ToUint8Array", () => {
  it("decodifica un string sin caracteres especiales ni padding faltante", () => {
    // bytes [1,2,3,4,5] -> "AQIDBAU=" en base64 estándar -> "AQIDBAU" en url-safe sin padding
    expect(Array.from(urlBase64ToUint8Array("AQIDBAU"))).toEqual([1, 2, 3, 4, 5]);
  });

  it("decodifica correctamente '-' y '_' (los caracteres que reemplazan a '+'/'/')", () => {
    // bytes [255,254,62,63,251] -> "//4+P/s=" estándar -> "__4-P_s" url-safe
    expect(Array.from(urlBase64ToUint8Array("__4-P_s"))).toEqual([255, 254, 62, 63, 251]);
  });

  it("agrega el padding que falte según la longitud del string", () => {
    // Un solo byte necesita 2 caracteres base64 + "==" de padding.
    expect(Array.from(urlBase64ToUint8Array("AA"))).toEqual([0]);
  });
});
