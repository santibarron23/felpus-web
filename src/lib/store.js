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
    contactoWhatsapp: row.contacto_whatsapp || "",
    contactoEmail: row.contacto_email || "",
    foto: fotos[0].url,
    fotos,
    hist: fotos[0].hist,
    embedding: fotos[0].embedding,
    nickname: row.nickname,
    userId: row.user_id || null,
    resuelto: row.resuelto,
    resueltoPor: row.resuelto_por,
    resueltoPorUserId: row.resuelto_por_user_id || null,
    resueltoEn: row.resuelto_en ? new Date(row.resuelto_en).getTime() : null,
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

function storagePathFromPublicUrl(url) {
  const marker = `/${PHOTOS_BUCKET}/`;
  const idx = String(url || "").indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

// Borra la publicación y sus fotos de Storage. El chequeo de dueño es
// doble: la política RLS de Supabase (única barrera real) más un filtro
// .eq("user_id", ...) acá — no aporta seguridad extra por sí solo, pero deja
// el intento explícito en el código en vez de confiar solo en que el botón
// de la UI ya lo filtró.
export async function deleteReport(reportId, ownerUserId, fotoUrls) {
  const paths = (fotoUrls || []).map(storagePathFromPublicUrl).filter(Boolean);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from(PHOTOS_BUCKET).remove(paths);
    if (storageError) {
      // No bloqueante: mejor borrar la fila igual que dejar una publicación
      // "zombie" que no se puede eliminar solo porque una foto vieja falló.
      console.error("No se pudieron borrar todas las fotos de Storage", storageError);
    }
  }
  const { error } = await supabase.from(REPORTS_TABLE).delete().eq("id", reportId).eq("user_id", ownerUserId);
  if (error) throw error;
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
    contacto_whatsapp: report.contactoWhatsapp || null,
    contacto_email: report.contactoEmail || null,
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

// Al confirmar un reencuentro, se borran los datos de contacto (WhatsApp/
// email) del reporte — ya cumplieron su propósito (avisar a quien lo
// publicó) y no hay motivo para dejarlos expuestos públicamente de forma
// indefinida una vez resuelto el caso. Fotos y descripción se mantienen,
// porque son las que muestran el "final feliz" en el resto de la app.
export async function resolveReports(ids, resolverUserId, resolverDisplayName) {
  const { error } = await supabase
    .from(REPORTS_TABLE)
    .update({
      resuelto: true,
      resuelto_por: resolverDisplayName,
      resuelto_por_user_id: resolverUserId,
      resuelto_en: new Date().toISOString(),
      contacto_whatsapp: null,
      contacto_email: null,
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

// El leaderboard general solo trae el top 10 — esto busca la posición real
// de un colaborador puntual (esté o no entre los primeros 10), contando
// cuántos tienen más puntos que él en vez de traer toda la tabla.
export async function fetchMyRank(userId) {
  if (!userId) return null;
  const { data: me, error: meError } = await supabase
    .from(CONTRIBUTORS_TABLE)
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (meError) throw meError;
  if (!me) return null;

  const { count, error: countError } = await supabase
    .from(CONTRIBUTORS_TABLE)
    .select("id", { count: "exact", head: true })
    .neq("id", "__seed_lock__")
    .gt("points", me.points || 0);
  if (countError) throw countError;

  return { ...me, rank: (count || 0) + 1 };
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

function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Racha de días consecutivos usando la app — la mecánica de retención más
// emblemática de apps tipo Duolingo. Se llama una vez por sesión apenas hay
// un usuario logueado; si "hoy" ya se contó, no hace nada (evita duplicar
// al recargar la página varias veces el mismo día).
export async function bumpStreak(userId, displayName) {
  if (!userId) return null;
  const { data: existing, error: fetchError } = await supabase
    .from(CONTRIBUTORS_TABLE)
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const today = localDateStr();
  const current = existing || {
    id: userId,
    nickname: displayName,
    points: 0,
    reportes: 0,
    reencuentros: 0,
    hearts: 0,
    streak_days: 0,
    last_active_date: null,
  };

  if (current.last_active_date === today) {
    return { streakDays: current.streak_days || 0, isNewToday: false };
  }

  const yesterday = localDateStr(new Date(Date.now() - 24 * 3600 * 1000));
  const continued = current.last_active_date === yesterday;
  current.nickname = displayName || current.nickname;
  current.streak_days = continued ? (current.streak_days || 0) + 1 : 1;
  current.last_active_date = today;
  current.updated_at = new Date().toISOString();

  const { error } = await supabase.from(CONTRIBUTORS_TABLE).upsert(current);
  if (error) throw error;
  return { streakDays: current.streak_days, isNewToday: true };
}

// Corazones: un gesto liviano de "gracias" entre colaboradores. Usa una
// función de base de datos (RPC) en vez de leer-y-escribir desde acá, por
// dos motivos: evita que dos corazones simultáneos se pisen (incremento
// atómico), y permite tocar la fila de OTRA persona de forma seguridad sin
// tener que abrir el update de "contributors" a cualquiera.
export async function sendHeart(contributorId) {
  const { data, error } = await supabase.rpc("send_heart", { target_id: contributorId });
  if (error) throw error;
  return data;
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
