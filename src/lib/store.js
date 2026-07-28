import { supabase } from "./supabaseClient";
import { computeHistogram, makePlaceholderSvg, normalizeNickname } from "./matching";

const REPORTS_TABLE = "reports";
const CONTRIBUTORS_TABLE = "contributors";
const PHOTOS_BUCKET = "felpus-photos";

function rowToReport(row) {
  const fotos =
    Array.isArray(row.foto_urls) && row.foto_urls.length
      ? row.foto_urls.map((url, i) => ({ url, hist: row.hists?.[i] ?? null, embedding: row.embeddings?.[i] ?? null }))
      : [{ url: row.foto_url, hist: row.hist, embedding: row.embedding || null }];
  return {
    id: row.id,
    tipo: row.tipo,
    especie: row.especie,
    nombre: row.nombre || "",
    color: row.color,
    colorOtro: row.color_otro || "",
    tamano: row.tamano,
    sexo: row.sexo || "",
    edad: row.edad || "",
    peso: row.peso || "",
    zona: row.zona,
    lat: row.lat,
    lng: row.lng,
    fecha: row.fecha,
    descripcion: row.descripcion,
    foto: fotos[0].url,
    fotos,
    hist: fotos[0].hist,
    embedding: fotos[0].embedding,
    nickname: row.nickname,
    userId: row.user_id || null,
    resuelto: row.resuelto,
    resueltoPor: row.resuelto_por,
    resueltoPorUserId: row.resuelto_por_user_id || null,
    creadoEn: new Date(row.creado_en).getTime(),
  };
}

export async function uploadPhoto(dataUrl, path) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type.includes("svg") ? "svg" : "jpg";
  const fullPath = `${path}.${ext}`;
  const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(fullPath, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(fullPath);
  return data.publicUrl;
}

export async function fetchReports() {
  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .select("*")
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToReport);
}

export async function createReport(report) {
  // Acepta tanto el formato nuevo (report.fotos: hasta 3 fotos) como el
  // formato de un solo dataUrl que sigue usando el sembrado de datos de
  // ejemplo (seedIfEmpty).
  const fotosInput = report.fotos?.length
    ? report.fotos
    : [{ dataUrl: report.foto, hist: report.hist, embedding: report.embedding || null }];

  const uploaded = [];
  for (let i = 0; i < fotosInput.length; i++) {
    const path = fotosInput.length > 1 ? `${report.id}-${i}` : report.id;
    const url = await uploadPhoto(fotosInput[i].dataUrl, path);
    uploaded.push({ url, hist: fotosInput[i].hist, embedding: fotosInput[i].embedding || null });
  }

  const { error } = await supabase.from(REPORTS_TABLE).insert({
    id: report.id,
    tipo: report.tipo,
    especie: report.especie,
    nombre: report.nombre || null,
    color: report.color,
    color_otro: report.colorOtro || null,
    tamano: report.tamano,
    sexo: report.sexo || null,
    edad: report.edad || null,
    peso: report.peso || null,
    zona: report.zona,
    lat: report.lat,
    lng: report.lng,
    fecha: report.fecha,
    descripcion: report.descripcion,
    foto_url: uploaded[0].url,
    hist: uploaded[0].hist,
    embedding: uploaded[0].embedding,
    foto_urls: uploaded.map((f) => f.url),
    hists: uploaded.map((f) => f.hist),
    embeddings: uploaded.map((f) => f.embedding),
    nickname: report.nickname,
    user_id: report.userId || null,
    resuelto: false,
  });
  if (error) throw error;
  return { ...report, foto: uploaded[0].url, fotos: uploaded };
}

export async function resolveReports(ids, resolverUserId, resolverDisplayName) {
  const { error } = await supabase
    .from(REPORTS_TABLE)
    .update({
      resuelto: true,
      resuelto_por: resolverDisplayName,
      resuelto_por_user_id: resolverUserId,
      resuelto_en: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) throw error;
}

export async function fetchLeaderboard() {
  const { data, error } = await supabase
    .from(CONTRIBUTORS_TABLE)
    .select("*")
    .neq("id", "__seed_lock__")
    .order("points", { ascending: false })
    .limit(10);
  if (error) throw error;
  return data || [];
}

// Los puntos quedan atados al user.id estable de Supabase Auth (no a un
// apodo de texto libre) — así solo colaboradores logueados con Google suman
// puntos, y dos personas nunca pueden "compartir" el mismo contador por
// escribir el mismo apodo.
export async function awardPoints(userId, displayName, delta, reason) {
  if (!userId) return;
  const { data: existing } = await supabase
    .from(CONTRIBUTORS_TABLE)
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  const current = existing || { id: userId, nickname: displayName, points: 0, reportes: 0, reencuentros: 0 };
  current.nickname = displayName || current.nickname;
  current.points = (current.points || 0) + delta;
  if (reason === "reencuentro") current.reencuentros = (current.reencuentros || 0) + 1;
  else if (reason !== "bono-reporte-original") current.reportes = (current.reportes || 0) + 1;
  current.updated_at = new Date().toISOString();

  const { error } = await supabase.from(CONTRIBUTORS_TABLE).upsert(current);
  if (error) throw error;
}

// Corazones: un gesto liviano de "gracias" entre colaboradores, sin puntaje
// ni implicancia económica — por eso alcanza con un contador simple.
export async function sendHeart(contributorId) {
  const { data: existing, error: fetchError } = await supabase
    .from(CONTRIBUTORS_TABLE)
    .select("hearts")
    .eq("id", contributorId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const nextHearts = (existing?.hearts || 0) + 1;
  const { error } = await supabase.from(CONTRIBUTORS_TABLE).update({ hearts: nextHearts }).eq("id", contributorId);
  if (error) throw error;
  return nextHearts;
}

// ---------------------------------------------------------------------------
// Datos de ejemplo para que la app no arranque vacía la primera vez.
// Se insertan una sola vez, sólo si la tabla reports está vacía.
// ---------------------------------------------------------------------------
const SEED_DEFS = [
  { tipo: "perdida", especie: "perro", nombre: "Rocky", color: "marrón y blanco", tamano: "mediano", zona: "Palermo", lat: -34.588, lng: -58.43, fecha: "2026-07-20", descripcion: "Perro mediano marrón con manchas blancas, collar azul, muy sociable. Se perdió cerca de Plaza Serrano.", nickname: "Vecina de Palermo", bg: "#9d7957", fg: "#f6eee1" },
  { tipo: "encontrada", especie: "perro", nombre: "", color: "marrón claro y blanco", tamano: "mediano", zona: "Palermo", lat: -34.585, lng: -58.432, fecha: "2026-07-22", descripcion: "Encontramos un perro mediano marrón claro con manchas blancas, collar celeste, deambulando cerca de Plaza Serrano.", nickname: "Kiosco Don Raúl", bg: "#a9825f", fg: "#f6eee1" },
  { tipo: "perdida", especie: "gato", nombre: "Mishi", color: "negro", tamano: "chico", zona: "Recoleta", lat: -34.588, lng: -58.393, fecha: "2026-07-18", descripcion: "Gato pequeño completamente negro, muy asustadizo, se escapó por el balcón en Recoleta.", nickname: "Fam. Ibarra", bg: "#2b1b12", fg: "#e4661e" },
  { tipo: "encontrada", especie: "gato", nombre: "", color: "gris atigrado", tamano: "chico", zona: "Belgrano", lat: -34.562, lng: -58.456, fecha: "2026-07-23", descripcion: "Gata chica gris atigrada encontrada en Belgrano, parece tener dueño, muy mansa.", nickname: "Portería Belgrano", bg: "#8a8a8a", fg: "#2b1b12" },
  { tipo: "encontrada", especie: "perro", nombre: "", color: "negro", tamano: "grande", zona: "Recoleta", lat: -34.589, lng: -58.395, fecha: "2026-07-19", descripcion: "Perro grande negro sin collar, encontrado cerca del cementerio de Recoleta, parece perdido hace días.", nickname: "Vecina de Palermo", bg: "#2b1b12", fg: "#d31c22" },
];

export async function seedIfEmpty() {
  // Antes de sembrar los datos de ejemplo, "reclamamos" un lock atómico.
  // Esto evita que se sembren duplicados si el efecto que llama a esta
  // función se dispara dos veces (pasa en desarrollo con React StrictMode,
  // o si dos personas abren la app al mismo tiempo por primera vez).
  const { error: lockError } = await supabase
    .from(CONTRIBUTORS_TABLE)
    .insert({ id: "__seed_lock__", nickname: "seed-lock", points: 0, reportes: 0, reencuentros: 0 });

  if (lockError) {
    // Ya existe el lock: alguien más ya sembró los datos (o lo está haciendo
    // en este mismo instante). No hacemos nada más.
    return;
  }

  for (const s of SEED_DEFS) {
    try {
      const svg = makePlaceholderSvg(s.especie, s.bg, s.fg);
      const hist = await computeHistogram(svg);
      const id = `seed-${s.especie}-${s.tipo}-${Math.random().toString(36).slice(2, 8)}`;
      const { bg, fg, ...rest } = s;
      await createReport({ ...rest, id, foto: svg, hist });
    } catch (e) {
      console.error("No se pudo insertar un reporte de ejemplo", e);
    }
  }

  const seedUsers = [
    { nickname: "Vecina de Palermo", points: 25, reportes: 2, reencuentros: 0 },
    { nickname: "Kiosco Don Raúl", points: 15, reportes: 1, reencuentros: 0 },
    { nickname: "Fam. Ibarra", points: 10, reportes: 1, reencuentros: 0 },
  ];
  for (const u of seedUsers) {
    try {
      const id = normalizeNickname(u.nickname);
      const { data: existing } = await supabase.from(CONTRIBUTORS_TABLE).select("id").eq("id", id).maybeSingle();
      if (!existing) {
        await supabase.from(CONTRIBUTORS_TABLE).insert({ id, ...u, updated_at: new Date().toISOString() });
      }
    } catch (e) {
      console.error("No se pudo insertar un contribuyente de ejemplo", e);
    }
  }
}
