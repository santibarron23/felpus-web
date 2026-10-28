// Reintentos ante cortes de red (2026-10-28): en el celular la conexión se
// corta a veces a mitad de la publicación (Safari: "Load failed") y la
// persona veía "No pudimos conectar con el servidor" aunque al segundo
// intento todo anda. Solo se reintenta un error de red — nunca uno que el
// servidor contestó (datos inválidos, límite por hora, etc.).

export function esErrorDeRed(err) {
  if (!err) return false;
  const msg = String(err.message || "");
  if (/Load failed|Failed to fetch|NetworkError|network connection was lost|Network request failed/i.test(msg)) return true;
  // @supabase/storage-js envuelve el TypeError de fetch en originalError.
  if (err.originalError && err.originalError !== err) return esErrorDeRed(err.originalError);
  return err.name === "TypeError" && /fetch|load|network/i.test(msg);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function conReintentos(fn, { intentos = 3, pausaMs = 1200, esperarFn = esperar } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await fn(i);
    } catch (err) {
      if (i >= intentos || !esErrorDeRed(err)) throw err;
      await esperarFn(pausaMs * i);
    }
  }
}
