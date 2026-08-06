import { supabase } from "./supabaseClient";
import { computeHistogram, makePlaceholderSvg, normalizeNickname } from "./matching";
import { logError } from "./log";

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
    raza: row.raza || "",
    // "Detalles para reconocerlo" (accesorio/reacción con desconocidos/marca
    // distintiva) — ver buildDetallesEstructurados en matching.js. Objeto
    // vacío por defecto para reportes viejos que no lo tienen.
    detalles: row.detalles || {},
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
      logError("No se pudieron borrar todas las fotos de Storage", storageError);
    }
  }
  const { error } = await supabase.from(REPORTS_TABLE).delete().eq("id", reportId).eq("user_id", ownerUserId);
  if (error) throw error;
}

// Todas las columnas MENOS contacto_whatsapp/contacto_email — el listado
// general (Explorar, mapa, franja de actividad) no necesita esos datos.
// Esto ya no es solo una convención del cliente: esas dos columnas tienen
// el SELECT revocado a nivel de Postgres para anon/authenticated (ver
// schema.sql), así que ni pidiéndolas acá ni con un SELECT directo a la API
// se puede traer el contacto en bloque — el único camino es fetchReportContact
// más abajo, que pasa por una función rate-limitada.
const REPORT_LIST_BASE_FIELDS = [
  "id", "tipo", "especie", "nombre", "color", "color_otro", "tamano", "sexo", "edad", "peso",
  "zona", "lat", "lng", "fecha", "descripcion", "foto_url", "hist", "embedding", "foto_urls",
  "hists", "embeddings", "nickname", "resuelto", "resuelto_por", "resuelto_por_user_id",
  "resuelto_en", "creado_en", "user_id",
];
// Columnas agregadas en migraciones posteriores a la primera versión de
// schema.sql (ver PENDIENTE_DECISION.md) que todavía pueden no existir en un
// despliegue que no corrió la última migración. Pedir una columna que no
// existe tira un error de PostgREST que tumba TODA la lista de reportes —a
// diferencia de columnas como push_subscription, que no viven en este
// select— así que fetchReports/createReport reintentan automáticamente sin
// la columna puntual que falte, en vez de dejar la app entera sin poder
// cargar/publicar reportes hasta que se corra la migración.
const REPORT_LIST_OPTIONAL_COLUMNS = ["raza", "detalles", "oculto"];

function reportListColumns(excluded) {
  const fields = [...REPORT_LIST_BASE_FIELDS];
  const insertAt = fields.indexOf("especie") + 1;
  const optional = REPORT_LIST_OPTIONAL_COLUMNS.filter((c) => !excluded.has(c));
  fields.splice(insertAt, 0, ...optional);
  return fields.join(",");
}

// Detecta si un error de PostgREST es por una columna puntual que no existe
// todavía (42703 undefined_column), y de ser así, cuál de las opcionales es.
function missingOptionalColumn(error, candidates) {
  if (!error) return null;
  const text = `${error.message || ""} ${error.code || ""}`;
  if (!text.includes("42703") && !/does not exist/i.test(text)) return null;
  return candidates.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text)) || null;
}

// includeHidden: true trae también las publicaciones ocultas (denunciadas
// 3+ veces o escondidas a mano por el admin) — solo lo usa el panel de
// administrador (ver adminListAllReports más abajo). El resto de la app
// (Explorar, mapa, matching) sigue llamando fetchReports() sin argumentos,
// que se comporta exactamente igual que antes.
export async function fetchReports({ includeHidden = false } = {}) {
  const excluded = new Set();
  for (let attempt = 0; attempt <= REPORT_LIST_OPTIONAL_COLUMNS.length; attempt++) {
    const columns = reportListColumns(excluded);
    const result = await supabase.from(REPORTS_TABLE).select(columns).order("creado_en", { ascending: false });
    const missing = missingOptionalColumn(result.error, REPORT_LIST_OPTIONAL_COLUMNS);
    if (!missing || excluded.has(missing)) {
      if (result.error) throw result.error;
      // Publicaciones denunciadas por 3+ IPs distintas (ver flag_report en
      // schema.sql) se quedan en la base para revisión manual, pero
      // desaparecen de acá — el único lugar del que salen Explorar, el mapa
      // y el matching. Si "oculto" todavía no existe (falta correr la
      // migración), row.oculto es undefined y nada se filtra: falla abierto,
      // igual que el resto de este mecanismo de columnas opcionales.
      const rows = includeHidden ? result.data || [] : (result.data || []).filter((row) => row.oculto !== true);
      return rows.map((row) => ({ ...rowToReport(row), oculto: row.oculto === true }));
    }
    excluded.add(missing);
  }
  throw new Error("No se pudo cargar el listado de reportes.");
}

// Se pide recién cuando alguien abre el detalle de ESE reporte puntual, y
// vía RPC (get_report_contact en schema.sql) en vez de un SELECT directo —
// esas dos columnas tienen el SELECT revocado a nivel de Postgres para
// anon/authenticated, así que un SELECT directo ya no funciona una vez
// corrida la migración. La función además rate-limitea por IP (30/hora),
// con su propio cupo separado del de crear reportes.
export async function fetchReportContact(reportId) {
  const rpcResult = await supabase.rpc("get_report_contact", { p_report_id: reportId });
  // Antes de correr la migración que crea get_report_contact (ver
  // PENDIENTE_DECISION.md), la función todavía no existe en la base — sin
  // este fallback, ver el contacto de cualquier reporte se rompería por
  // completo hasta que se corra. Cae al SELECT directo de siempre, que
  // sigue funcionando mientras tanto (recién queda revocado cuando se
  // corre la migración, junto con la función).
  if (rpcResult.error && isMissingFunctionError(rpcResult.error)) {
    const { data, error } = await supabase
      .from(REPORTS_TABLE)
      .select("contacto_whatsapp,contacto_email")
      .eq("id", reportId)
      .maybeSingle();
    if (error) throw error;
    return { contactoWhatsapp: data?.contacto_whatsapp || "", contactoEmail: data?.contacto_email || "" };
  }
  if (rpcResult.error) throw rpcResult.error;
  const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
  return {
    contactoWhatsapp: row?.contacto_whatsapp || "",
    contactoEmail: row?.contacto_email || "",
  };
}

function isMissingFunctionError(error) {
  if (!error) return false;
  const text = `${error.message || ""} ${error.code || ""}`;
  return text.includes("42883") || text.includes("PGRST202") || /could not find the function|does not exist/i.test(text);
}

// Denunciar una publicación como falsa/errónea/inapropiada. Va por RPC
// (flag_report en schema.sql), no por un insert directo a report_flags —
// esa tabla no tiene política de INSERT para anon/authenticated a propósito
// (mismo motivo que get_report_contact: el rate limiting por IP y el conteo
// de IPs distintas para autoocultar tienen que vivir en el servidor, no
// depender de que el cliente los respete).
export async function flagReport(reportId, reason) {
  const { error } = await supabase.rpc("flag_report", { p_report_id: reportId, p_reason: reason });
  if (error) {
    // Antes de correr la migración que agrega flag_report, la función
    // todavía no existe — un mensaje claro en vez del error crudo de
    // PostgREST ("could not find the function...").
    if (isMissingFunctionError(error)) {
      throw new Error("Denunciar todavía no está disponible en este momento. Probá de nuevo más tarde.");
    }
    throw error;
  }
}

// Mensaje compartido por las 4 funciones de admin de abajo: todas dependen
// de RPCs que todavía no existen hasta correr la migración de schema.sql
// (ver PENDIENTE_DECISION.md), y todas fallan de la misma forma cuando eso
// pasa — un solo texto en vez de repetirlo 4 veces.
const ADMIN_RPC_MISSING_MSG = "El panel de administrador todavía no está disponible en este momento. Probá de nuevo más tarde.";

// Trae TODOS los reportes, incluidos los ocultos — es fetchReports() con
// includeHidden, nombrado aparte para que se lea claro en el panel de admin
// qué se está pidiendo y por qué (no hace falta una función nueva: el
// filtro por fila ya lo controla la columna "oculto" del lado del cliente,
// igual que el resto de fetchReports).
export async function adminListAllReports() {
  return fetchReports({ includeHidden: true });
}

// Borra CUALQUIER publicación (no solo la propia) — vía RPC security
// definer (admin_delete_report en schema.sql), gateada por el email del
// admin del lado del servidor. Mismo flujo de dos pasos que deleteReport()
// (borrar la foto de Storage primero, después la fila): la policy
// felpus_photos_admin_delete es lo que le permite al admin borrar una foto
// que no es suya.
export async function adminDeleteReport(report) {
  const paths = (report.fotos || []).map((f) => storagePathFromPublicUrl(f.url)).filter(Boolean);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from(PHOTOS_BUCKET).remove(paths);
    if (storageError) {
      logError("No se pudieron borrar todas las fotos de Storage (admin)", storageError);
    }
  }
  const { error } = await supabase.rpc("admin_delete_report", { p_report_id: report.id });
  if (error) {
    if (isMissingFunctionError(error)) throw new Error(ADMIN_RPC_MISSING_MSG);
    throw error;
  }
}

// Ocultar/mostrar una publicación a mano — mismo campo "oculto" que usa el
// auto-ocultamiento de flag_report, así que esto también sirve para
// revertir un falso positivo (una publicación legítima que llegó a 3
// denuncias infundadas).
export async function adminSetOculto(reportId, oculto) {
  const { error } = await supabase.rpc("admin_set_oculto", { p_report_id: reportId, p_oculto: oculto });
  if (error) {
    if (isMissingFunctionError(error)) throw new Error(ADMIN_RPC_MISSING_MSG);
    throw error;
  }
}

// Denuncias agrupadas por reporte (ver admin_list_flagged_reports en
// schema.sql) — report_flags no tiene política de SELECT propia, así que
// esta RPC es el único camino para leerlas desde el cliente.
export async function adminListFlaggedReports() {
  const { data, error } = await supabase.rpc("admin_list_flagged_reports");
  if (error) {
    if (isMissingFunctionError(error)) throw new Error(ADMIN_RPC_MISSING_MSG);
    throw error;
  }
  return (data || []).map((row) => ({
    reportId: row.report_id,
    tipo: row.tipo,
    especie: row.especie,
    nombre: row.nombre || "",
    zona: row.zona,
    fotoUrl: row.foto_url,
    oculto: row.oculto === true,
    flagCount: Number(row.flag_count) || 0,
    distinctIps: Number(row.distinct_ips) || 0,
    reasons: row.reasons || [],
    lastFlaggedAt: row.last_flagged_at ? new Date(row.last_flagged_at).getTime() : null,
  }));
}

// Métricas básicas del panel de admin (ver admin_metrics en schema.sql) —
// un solo viaje de red en vez de varios counts sueltos desde el cliente.
export async function adminFetchMetrics() {
  const { data, error } = await supabase.rpc("admin_metrics");
  if (error) {
    if (isMissingFunctionError(error)) throw new Error(ADMIN_RPC_MISSING_MSG);
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    total: Number(row?.total) || 0,
    perdidas: Number(row?.perdidas) || 0,
    encontradas: Number(row?.encontradas) || 0,
    resueltos: Number(row?.resueltos) || 0,
    ocultos: Number(row?.ocultos) || 0,
    last24h: Number(row?.last_24h) || 0,
    last7d: Number(row?.last_7d) || 0,
    contributors: Number(row?.contributors) || 0,
    flagsTotal: Number(row?.flags_total) || 0,
    flaggedReportsPending: Number(row?.flagged_reports_pending) || 0,
    errors24h: Number(row?.errors_24h) || 0,
  };
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

  const row = {
    id: report.id,
    tipo: report.tipo,
    especie: report.especie,
    raza: report.raza || null,
    detalles: report.detalles && Object.keys(report.detalles).length ? report.detalles : null,
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
  };

  // Mismo motivo que en fetchReports: antes de correr la migración que
  // agrega "raza"/"detalles" (ver PENDIENTE_DECISION.md), publicar un
  // reporte nuevo fallaría por completo si alguna de esas columnas no existe
  // todavía. Reintenta sin el campo puntual que falte — la persona pierde
  // sólo ese dato hasta que se corra la migración, no la posibilidad de
  // publicar.
  let attemptRow = row;
  let finalError = null;
  for (let attempt = 0; attempt <= REPORT_LIST_OPTIONAL_COLUMNS.length; attempt++) {
    const result = await supabase.from(REPORTS_TABLE).insert(attemptRow);
    const missing = missingOptionalColumn(result.error, REPORT_LIST_OPTIONAL_COLUMNS);
    if (!missing || !(missing in attemptRow)) {
      finalError = result.error;
      break;
    }
    const { [missing]: _omit, ...rest } = attemptRow;
    attemptRow = rest;
    finalError = result.error;
  }
  if (finalError) throw finalError;
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
//
// Vía RPC (award_points en schema.sql), no un lee-y-escribe directo: el
// caso "bono-reporte-original" (markResolvedAndReward en FelpusMatcher.jsx)
// le suma puntos al DUEÑO DEL OTRO REPORTE del match, no a quien está
// confirmando — una fila ajena, que la policy contributors_update_own
// bloquea siempre desde el cliente. Antes de este fix, ESE caso puntual
// fallaba el 100% de las veces (RLS deniega el UPDATE del upsert), y el
// error tumbaba todo el flujo de "confirmar reencuentro" con un mensaje
// genérico, aunque el reporte ya se hubiera guardado como resuelto igual.
export async function awardPoints(userId, displayName, delta, reason) {
  if (!userId) return;
  const rpcResult = await supabase.rpc("award_points", {
    p_user_id: userId,
    p_display_name: displayName || null,
    p_delta: delta,
    p_reason: reason,
  });
  if (!rpcResult.error) return;
  if (!isMissingFunctionError(rpcResult.error)) throw rpcResult.error;

  // Antes de correr la migración que crea award_points (ver
  // PENDIENTE_DECISION.md): cae al lee-y-escribe de siempre, que sigue
  // funcionando para sumarse puntos A UNO MISMO (RLS lo permite), pero NO
  // para "bono-reporte-original" — ese caso sigue fallando hasta correr la
  // migración, igual que ya fallaba antes de este fix. markResolvedAndReward
  // ya aísla ese caso puntual para que su falla no tumbe el resto del flujo.
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
  { tipo: "encontrada", especie: "perro", nombre: "", color: "marrón claro y blanco", tamano: "mediano", zona: "Palermo", lat: -34.585, lng: -58.432, fecha: "2026-07-22", descripcion: "Encontramos un perro mediano marrón claro con manchas blancas, collar celeste, deambulando cerca de Plaza Serrano.", nickname: "Kiosco Don Raúl", bg: "#8f6a48", fg: "#f6eee1" },
  { tipo: "perdida", especie: "gato", nombre: "Mishi", color: "negro", tamano: "chico", zona: "Recoleta", lat: -34.588, lng: -58.393, fecha: "2026-07-18", descripcion: "Gato pequeño completamente negro, muy asustadizo, se escapó por el balcón en Recoleta.", nickname: "Fam. Ibarra", bg: "#2b1b12", fg: "#e4661e" },
  { tipo: "encontrada", especie: "gato", nombre: "", color: "gris atigrado", tamano: "chico", zona: "Belgrano", lat: -34.562, lng: -58.456, fecha: "2026-07-23", descripcion: "Gata chica gris atigrada encontrada en Belgrano, parece tener dueño, muy mansa.", nickname: "Portería Belgrano", bg: "#8a8a8a", fg: "#2b1b12" },
  { tipo: "encontrada", especie: "perro", nombre: "", color: "negro", tamano: "grande", zona: "Recoleta", lat: -34.589, lng: -58.395, fecha: "2026-07-19", descripcion: "Perro grande negro sin collar, encontrado cerca del cementerio de Recoleta, parece perdido hace días.", nickname: "Vecina de Palermo", bg: "#2b1b12", fg: "#f0483a" },
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
      logError("No se pudo insertar un reporte de ejemplo", e);
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
      logError("No se pudo insertar un contribuyente de ejemplo", e);
    }
  }
}
