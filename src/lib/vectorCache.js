// Vectores de las fotos guardados en el dispositivo (2026-11-02). Son lo más
// pesado que baja Felpus (≈460 KB comprimidos para ~220 avisos, 9 veces el
// listado) y antes se bajaban completos en cada visita: eran casi todo el
// egress de Supabase. Ahora se guardan en IndexedDB y en cada visita se piden
// solo los de avisos nuevos o con fotos cambiadas.
//
// Un vector solo cambia si cambian las fotos del aviso (recorte del admin,
// reordenar del dueño): la "firma" son las URLs de sus fotos, en orden.
// Si IndexedDB no está (modo privado, navegador viejo), todo sigue andando:
// se baja todo como antes.

const DB = "felpus";
const STORE = "vectores";
const VERSION = 1;

export function firmaFotos(report) {
  const urls = (report?.fotos || []).map((f) => f?.url).filter(Boolean);
  return urls.length ? urls.join("|") : String(report?.foto || "");
}

// cache: Map id → { firma, row }. Devuelve qué filas sirven tal cual, qué ids
// hay que pedir y qué ids sobran (avisos que ya no están en el listado).
export function planVectores(reports, cache) {
  const vigentes = [];
  const faltan = [];
  const ids = new Set();
  for (const r of reports || []) {
    if (!r?.id) continue;
    ids.add(r.id);
    const guardado = cache?.get(r.id);
    if (guardado && guardado.firma === firmaFotos(r)) vigentes.push(guardado.row);
    else faltan.push(r.id);
  }
  const sobran = [...(cache?.keys() || [])].filter((id) => !ids.has(id));
  return { vigentes, faltan, sobran };
}

// De a tandas: el filtro "id=in.(…)" va en la URL.
export function enTandas(lista, tam = 100) {
  const out = [];
  for (let i = 0; i < lista.length; i += tam) out.push(lista.slice(i, i + tam));
  return out;
}

function abrir() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Sin IndexedDB"));
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Map id → { firma, row }; vacío si no se puede leer.
export async function leerCache() {
  try {
    const db = await abrir();
    return await new Promise((resolve) => {
      const out = new Map();
      const req = db.transaction(STORE).objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out);
        out.set(c.key, c.value);
        c.continue();
      };
      req.onerror = () => resolve(out);
    });
  } catch {
    return new Map();
  }
}

// guardar: [{ id, firma, row }]; borrar: [id]. Si falla, no pasa nada: la
// próxima visita se vuelven a pedir.
export async function escribirCache(guardar, borrar) {
  try {
    const db = await abrir();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      for (const g of guardar) st.put({ firma: g.firma, row: g.row }, g.id);
      for (const id of borrar) st.delete(id);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
  } catch {
    // sin caché
  }
}

// Todo junto: filas de vectores para `reports`, pidiendo a la red (fetchIds:
// ids → filas) solo lo que falta. Devuelve { rows, pedidos } (pedidos: cuántos
// avisos se bajaron, para medir).
export async function vectoresConCache(reports, fetchIds, io = { leerCache, escribirCache }) {
  const cache = await io.leerCache();
  const { vigentes, faltan, sobran } = planVectores(reports, cache);
  const nuevos = [];
  for (const tanda of enTandas(faltan)) nuevos.push(...((await fetchIds(tanda)) || []));
  const porId = new Map((reports || []).map((r) => [r.id, r]));
  const guardar = nuevos.filter((row) => porId.has(row.id)).map((row) => ({ id: row.id, firma: firmaFotos(porId.get(row.id)), row }));
  if (guardar.length || sobran.length) await io.escribirCache(guardar, sobran);
  return { rows: [...vigentes, ...nuevos], pedidos: faltan.length };
}
