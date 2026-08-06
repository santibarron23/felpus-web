// Parsing/validación de teléfono para el campo de WhatsApp — pensado para
// que nadie tenga que escribir "+54 9 11 1234 5678" a mano. Se apoya en
// libphonenumber-js (el mismo motor, en versión JS, que usa la libphonenumber
// de Google) en vez de inventar reglas de formato país por país: cada país
// tiene su propia lógica de prefijos/longitudes/áreas, y reimplementarla a
// mano es exactamente el tipo de trabajo que ya está resuelto — y muy bien
// probado — en una librería madura.
//
// Import dinámico (como loadGoogleMaps en googleMaps.js): la metadata de
// todos los países pesa lo suyo, y el 100% de quienes visitan Felpus no
// necesitan que se cargue hasta que entran a "Reportar" y tocan el campo de
// WhatsApp — cargarla en el bundle principal penalizaría a todo el mundo
// por una función que la mayoría ni usa en esa visita.
import { logError } from "./log";

let phoneLibPromise = null;
export function loadPhoneLib() {
  if (phoneLibPromise) return phoneLibPromise;
  phoneLibPromise = import("libphonenumber-js/min").catch((e) => {
    // Mismo motivo que loadGoogleMaps: un fallo de carga (red, ad-blocker)
    // no debe quedar cacheado para siempre — la próxima vez que alguien
    // toque el campo, se reintenta desde cero en vez de fallar para
    // siempre hasta recargar la página.
    phoneLibPromise = null;
    throw e;
  });
  return phoneLibPromise;
}

// País por defecto: heurística instantánea y sin permisos (no dispara el
// prompt de geolocalización del navegador, que sería excesivo solo para
// adivinar un país) basada en el idioma/región que el navegador ya declara
// para sí mismo. Si no hay región reconocible, "AR" — Felpus es una app
// argentina de punta a punta (texto, zonas de ejemplo, moneda de las
// donaciones), así que es el default correcto, no una elección arbitraria.
// Nunca bloquea ni tira: en el peor caso, siempre devuelve algo usable.
export const DEFAULT_COUNTRY = "AR";

// Países fijados arriba de la lista alfabética — mismo criterio que
// RAZA_ESPECIALES en matching.js (lo más probable, primero, sin que la
// persona tenga que buscarlo en una lista larga). Argentina primero porque
// es la enorme mayoría del uso real de Felpus hoy; el resto son los países
// limítrofes/hispanohablantes con más chance de aparecer después.
export const PRIORITY_COUNTRIES = ["AR", "UY", "CL", "PY", "BO", "BR", "MX", "ES", "US"];

export function getDefaultCountry() {
  if (typeof navigator === "undefined") return DEFAULT_COUNTRY;
  try {
    const candidates = navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean);
    for (const lang of candidates) {
      // "es-AR" -> "AR", "pt-BR" -> "BR". Un idioma sin región ("es", "en")
      // no dice nada del país, se salta sin intentar adivinar.
      const region = lang?.split("-")[1];
      if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
    }
  } catch (e) {
    // No debería tirar nunca, pero si el entorno hace algo raro con
    // navigator.languages, no vale la pena que rompa el formulario por esto.
    logError("No se pudo detectar el país por defecto", e);
  }
  return DEFAULT_COUNTRY;
}

// Nombre en español de un país a partir de su código ISO — Intl.DisplayNames
// es nativo del navegador (sin costo de bundle) y evita mantener una lista
// de ~240 nombres a mano. Memoizado: crear la instancia de Intl.DisplayNames
// no es gratis y esto se llama seguido (lista de países, mensajes de error).
let displayNames = null;
export function countryDisplayName(code) {
  if (!code) return "";
  try {
    if (!displayNames) displayNames = new Intl.DisplayNames(["es"], { type: "region" });
    return displayNames.of(code) || code;
  } catch (e) {
    // Intl.DisplayNames no existe en absolutamente todos los entornos
    // (navegadores muy viejos) — cae al código tal cual antes que romper.
    return code;
  }
}

// Bandera a partir del código ISO-3166 alpha-2: cada letra se mapea a su
// "regional indicator symbol" Unicode (A=U+1F1E6...Z=U+1F1FF) — el mismo
// truco que usan la mayoría de los selectores de país sin bundlear un set
// de imágenes de banderas. Se ve como emoji en cualquier SO/navegador
// moderno (mobile incluido, que es el caso que más importa acá).
export function flagEmoji(code) {
  if (!code || code.length !== 2) return "🏳️";
  const base = 127397; // 0x1F1E6 - 'A'.charCodeAt(0)
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => c.charCodeAt(0) + base));
}

let countryListPromise = null;
// Lista completa {code, name, flag, callingCode} para el selector — países
// prioritarios primero (ver PRIORITY_COUNTRIES), después el resto en orden
// alfabético real en español (Intl.Collator, no localeCompare a mano —
// mismo criterio que RAZA_OPTIONS_PERRO en matching.js, para que acentos
// como "Bolivia" no ordenen mal).
export function getCountryList() {
  if (countryListPromise) return countryListPromise;
  countryListPromise = loadPhoneLib().then((lib) => {
    const collator = new Intl.Collator("es", { sensitivity: "base" });
    const all = lib
      .getCountries()
      .map((code) => ({
        code,
        name: countryDisplayName(code),
        flag: flagEmoji(code),
        callingCode: lib.getCountryCallingCode(code),
      }))
      .sort((a, b) => collator.compare(a.name, b.name));
    const priority = PRIORITY_COUNTRIES.map((code) => all.find((c) => c.code === code)).filter(Boolean);
    const rest = all.filter((c) => !PRIORITY_COUNTRIES.includes(c.code));
    return [...priority, ...rest];
  });
  return countryListPromise;
}

// Formateo en vivo mientras se escribe (AsYouType) — puramente estético,
// no valida nada: "3875885427" se va viendo como "387 588-5427" a medida
// que la persona escribe, sin esperar a que termine. Una instancia nueva
// por llamada (en vez de reusar un AsYouType persistente entre keystrokes)
// es el patrón recomendado por la librería para inputs controlados de
// React: recalcula desde el texto actual completo, así que nunca puede
// quedar en un estado interno inconsistente con lo que ve la persona.
export async function formatAsYouType(rawText, country) {
  if (!rawText) return "";
  try {
    const lib = await loadPhoneLib();
    return new lib.AsYouType(country).input(rawText);
  } catch (e) {
    // Sin la librería cargada (todavía, o falló la carga), se devuelve el
    // texto tal cual — la persona puede seguir escribiendo sin trabas,
    // simplemente sin el formateo bonito hasta que la librería esté lista.
    return rawText;
  }
}

// Inserta el "9" que WhatsApp necesita para números móviles argentinos en
// formato internacional (+54 9 ...) — sin él, wa.me abre un chat roto o
// directamente no abre nada. Es una particularidad real y documentada de
// Argentina (la separación entre "+54" de llamada normal y "+54 9" de
// celular), no una regla inventada a mano: WhatsApp Business también la
// documenta como caso especial. libphonenumber-js normaliza correctamente
// prefijos/0/15 pero NO agrega este "9" por sí solo cuando falta, así que
// es el único ajuste puntual que hace falta encima de la librería.
function ensureArgentinaMobile9(e164) {
  if (e164.startsWith("+549")) return e164;
  if (e164.startsWith("+54")) return `+549${e164.slice(3)}`;
  return e164;
}

// Resultado de intentar interpretar lo que la persona escribió como
// teléfono de WhatsApp:
//   - isValid true  -> e164 ("+5493875885427"), digits ("5493875885427",
//     lo que se guarda en la base y arma el link wa.me/<digits>, igual
//     formato que usaba sanitizePhoneForWhatsapp de matching.js — ningún
//     cambio en cómo se almacena ni en cómo se arman los links) y country
//     (el país REAL detectado — puede diferir del país pasado como
//     argumento si se pegó un número internacional completo, ver
//     PhoneInput.jsx: ahí se usa para resincronizar el selector).
//   - isValid false -> reason explica QUÉ falta, para un mensaje de error
//     concreto en vez de "número inválido" a secas (ver PhoneInput.jsx):
//       "empty"      no escribió nada
//       "too_short"  parece incompleto (le faltan dígitos)
//       "invalid"    no se pudo interpretar como número de ese país
export async function parseWhatsappPhone(rawText, country) {
  const text = (rawText || "").trim();
  if (!text) return { isValid: false, reason: "empty", e164: "", digits: "", country: null };
  let lib;
  try {
    lib = await loadPhoneLib();
  } catch (e) {
    // Sin la librería no hay forma de validar — se deja pasar tal cual
    // (dígitos crudos) antes que bloquear a alguien por un problema de
    // red nuestro. handleSubmit igual exige un mínimo de dígitos como
    // último respaldo (ver FelpusMatcher.jsx).
    const digits = text.replace(/\D/g, "");
    return {
      isValid: digits.length >= 8,
      reason: digits.length >= 8 ? null : "too_short",
      e164: digits ? `+${digits}` : "",
      digits,
      country: null,
    };
  }
  let phoneNumber;
  try {
    phoneNumber = lib.parsePhoneNumberFromString(text, country);
  } catch (e) {
    phoneNumber = undefined;
  }
  if (!phoneNumber) {
    // parsePhoneNumberFromString ya devuelve undefined (no tira) para la
    // gran mayoría de entradas raras, pero por las dudas: si el texto trae
    // AL MENOS dígitos suficientes para ser un número truncado, es más útil
    // decir "incompleto" que "no se pudo interpretar".
    const digits = text.replace(/\D/g, "");
    return { isValid: false, reason: digits.length >= 5 ? "too_short" : "invalid", e164: "", digits: "", country: null };
  }
  if (!phoneNumber.isValid()) {
    const reason = phoneNumber.isPossible() ? "invalid" : "too_short";
    return { isValid: false, reason, e164: "", digits: "", country: phoneNumber.country || null };
  }
  const e164 = phoneNumber.country === "AR" ? ensureArgentinaMobile9(phoneNumber.number) : phoneNumber.number;
  return { isValid: true, reason: null, e164, digits: e164.slice(1), country: phoneNumber.country || null };
}

// Camino inverso: a partir de un E.164 (o dígitos sueltos, sin "+", como
// quedan guardados hoy en reports.contacto_whatsapp) reconstruye país +
// número nacional formateado, para precargar el campo — con un contacto
// guardado en este dispositivo (localStorage, ver FelpusMatcher.jsx) o con
// cualquier otro E.164 ya conocido.
export async function splitStoredWhatsapp(stored) {
  const digits = (stored || "").replace(/\D/g, "");
  if (!digits) return { country: null, national: "" };
  try {
    const lib = await loadPhoneLib();
    const phoneNumber = lib.parsePhoneNumberFromString(`+${digits}`);
    if (!phoneNumber) return { country: null, national: "" };
    // No se usa formatNational() acá a propósito: para Argentina devuelve
    // el formato de discado DOMÉSTICO ("0387 15-588-5427", con el prefijo
    // de larga distancia "0" y el marcador de celular "15") — correcto para
    // discar desde un teléfono fijo, pero no lo que la persona escribió ni
    // lo que esperaría ver al editar. nationalNumber es el número "puro"
    // sin ese ropaje; para AR además hay que sacarle el "9" inicial (ver
    // ensureArgentinaMobile9 más arriba: es el marcador de celular
    // INTERNACIONAL, vive en nationalNumber por cómo libphonenumber-js
    // modela a Argentina, pero tampoco es algo que la persona haya tipeado).
    let national = phoneNumber.nationalNumber;
    if (phoneNumber.country === "AR" && national.startsWith("9")) national = national.slice(1);
    return { country: phoneNumber.country || null, national: new lib.AsYouType(phoneNumber.country).input(national) };
  } catch (e) {
    return { country: null, national: "" };
  }
}

// Formato lindo y completo ("+54 9 387 588 5427") para mostrar un contacto
// ya guardado — a diferencia de splitStoredWhatsapp (que separa país/número
// para un campo EDITABLE), esto es de solo lectura: la pill "Cambiar" que
// reemplaza al input vacío para quien ya publicó antes desde este
// dispositivo (ver FelpusMatcher.jsx).
export async function formatE164ForDisplay(e164) {
  if (!e164) return "";
  try {
    const lib = await loadPhoneLib();
    const phoneNumber = lib.parsePhoneNumberFromString(e164);
    return phoneNumber ? phoneNumber.formatInternational() : e164;
  } catch (e) {
    return e164;
  }
}
