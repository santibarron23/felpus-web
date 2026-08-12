import { supabase } from "./supabaseClient";
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
    // Estructuradas a partir de Google Places (ver ZonaAutocomplete.jsx) —
    // vacías para reportes viejos o publicados con zona tipeada a mano.
    ciudad: row.ciudad || "",
    provincia: row.provincia || "",
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

// Auditoría integral (2026-08-09) — hallazgo real: "path" venía armado a
// partir del id del reporte (ver createReport más abajo), y el id de un
// reporte NO es secreto (aparece en la URL pública /r/<id> y en los links
// de compartir). Con "upsert: true" y la policy de Storage abierta a
// cualquiera (insert público, necesario para que invitados sin login
// puedan reportar), CUALQUIERA que conociera o adivinara el id de un
// reporte ajeno podía subir un archivo al mismo path y REEMPLAZAR su foto
// — sin necesitar ser su dueño ni tocar la fila de "reports" en absoluto.
// El sufijo aleatorio de abajo (crypto.randomUUID(), 122 bits — no
// practicable de adivinar) hace que cada subida caiga siempre en un path
// nuevo e impredecible, cerrando el hueco sin necesitar mover el upload
// detrás de una ruta propia (que hubiera roto el borrado de fotos —
// felpus_photos_owner_delete depende de que "owner" quede seteado al
// auth.uid() real de quien sube, algo que se pierde si el upload pasa por
// la service_role key). upsert ahora en false: como cada path es siempre
// nuevo, no hace falta pisar nada — si alguna vez colisiona (no debería),
// mejor que falle fuerte a que sobreescriba en silencio.
export async function uploadPhoto(dataUrl, path) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type.includes("svg") ? "svg" : "jpg";
  const fullPath = `${path}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(fullPath, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
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
const REPORT_LIST_OPTIONAL_COLUMNS = ["raza", "detalles", "oculto", "ciudad", "provincia"];

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

// Se pide recién cuando alguien abre el detalle de ESE reporte puntual.
//
// Hallazgo de auditoría de seguridad (2026-08-07): antes esto llamaba
// directo a la RPC get_report_contact con la anon key, y esa función leía
// la IP para el rate limit de un header HTTP que quien llama a la API
// controla por completo — se confirmó en vivo que rotar ese header
// resetea el cupo de 30/hora sin límite real (ver PENDIENTE_DECISION.md
// #-14). Ahora pasa por /api/report-contact (server-side): la IP la
// determina Vercel en el request real, no falsificable, y la RPC en sí
// quedó restringida al rol service_role — ya no es alcanzable con la anon
// key ni siquiera llamándola directo.
export async function fetchReportContact(reportId) {
  const res = await fetch("/api/report-contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "No pudimos obtener el contacto. Probá de nuevo.");
  return {
    contactoWhatsapp: data?.contactoWhatsapp || "",
    contactoEmail: data?.contactoEmail || "",
  };
}

function isMissingFunctionError(error) {
  if (!error) return false;
  const text = `${error.message || ""} ${error.code || ""}`;
  return text.includes("42883") || text.includes("PGRST202") || /could not find the function|does not exist/i.test(text);
}

// Mismo espíritu que isMissingFunctionError, para tablas/columnas nuevas de
// "Mi Felpus" (saved_reports, contributors.whatsapp) antes de correr la
// migración — un mensaje claro en vez del error crudo de PostgREST.
function isMissingTableError(error) {
  if (!error) return false;
  const text = `${error.message || ""} ${error.code || ""}`;
  return text.includes("42P01") || text.includes("PGRST205") || /could not find the table/i.test(text);
}

function isMissingColumnError(error, columnName) {
  if (!error) return false;
  const text = `${error.message || ""} ${error.code || ""}`;
  if (!text.includes("42703") && !text.includes("PGRST204") && !/does not exist/i.test(text)) return false;
  return new RegExp(`\\b${columnName}\\b`, "i").test(text);
}

// Denunciar una publicación como falsa/errónea/inapropiada.
//
// Hallazgo de auditoría de seguridad (2026-08-07) — el más grave de los
// encontrados: flag_report auto-oculta un reporte apenas ve 3 IPs
// DISTINTAS denunciando, y esa IP se leía del mismo header falsificable
// que get_report_contact (ver comentario ahí y PENDIENTE_DECISION.md
// #-14) — con IPs falsas rotando libremente, cualquiera podía ocultar
// CUALQUIER reporte ajeno en 3 pedidos. Mismo fix: pasa por
// /api/flag-report (server-side, IP determinada por Vercel), la RPC quedó
// restringida a service_role.
export async function flagReport(reportId, reason) {
  const res = await fetch("/api/flag-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportId, reason }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "No pudimos enviar la denuncia. Probá de nuevo.");
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

// Informe de cuentas registradas (ver admin_list_users en schema.sql) —
// apodo/email/whatsapp de cada login de Google. Se usa para el botón
// "Descargar informe de usuarios" del panel de admin (ver
// handleDownloadUsersReport en FelpusMatcher.jsx + usersReportToCsv en
// csv.js), pero se deja como función aparte (no ligada al CSV) para poder
// testearla y, si algún día hace falta, mostrarla en pantalla también.
export async function adminFetchUsers() {
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) {
    if (isMissingFunctionError(error)) throw new Error(ADMIN_RPC_MISSING_MSG);
    throw error;
  }
  return data || [];
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
  // formato legado de un solo dataUrl (report.foto/report.hist) — ya no
  // lo genera ningún camino real de la app (el sembrado de datos de
  // ejemplo que lo usaba, seedIfEmpty, se quitó — ver el comentario junto
  // a donde vivía, más abajo en este archivo), pero se deja el soporte
  // por si un test o un caller externo todavía lo pasa así.
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
    ciudad: report.ciudad || null,
    provincia: report.provincia || null,
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

  // Hallazgo de auditoría de seguridad (2026-08-07): el insert de la fila
  // (antes directo, con la anon key) dejó el rate limit de 8/hora en manos
  // de un trigger de base que leía la IP de un header HTTP falsificable por
  // quien llama a la API — mismo hueco que se cerró en fetchReportContact/
  // flagReport (ver PENDIENTE_DECISION.md #-14). Ahora pasa por
  // /api/create-report (server-side, IP determinada por Vercel), que
  // además NUNCA confía en report.userId — deriva el user_id real del
  // token de sesión, verificado server-side, así que ni siquiera alguien
  // manipulando el JS del cliente puede publicar a nombre de otra cuenta.
  // El reintento sin columnas opcionales (raza/detalles/etc., antes de
  // correr la migración más reciente) se replicó igual dentro de esa ruta.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  const res = await fetch("/api/create-report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ row }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "No se pudo publicar el reporte. Probá de nuevo.");
  }
  // pushToken (auditoría integral, 2026-08-09): capability token para poder
  // activar notificaciones push de ESTE reporte sin login — ver
  // subscribeReportPush en push.js y el comentario largo en schema.sql.
  // Solo llega acá, una vez, en la respuesta directa de publicar; nunca se
  // vuelve a poder leer después (no es una columna pública).
  return { ...report, foto: uploaded[0].url, fotos: uploaded, pushToken: data?.pushToken || null };
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

// ---------------------------------------------------------------------------
// "Mi Felpus" — perfil + mascotas guardadas (ver la nota larga en
// schema.sql sobre por qué el perfil vive en contributors y no en una
// tabla nueva).
// ---------------------------------------------------------------------------

// Puede devolver null: alguien logueado que nunca reportó ni confirmó un
// reencuentro todavía no tiene fila en contributors — es un perfil vacío
// válido, no un error (ver updateProfile, que lo crea recién al guardar).
export async function fetchProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.from(CONTRIBUTORS_TABLE).select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

// upsert, no update: cubre tanto a quien ya tiene fila en contributors
// (por puntos ganados) como a quien todavía no tiene ninguna — la misma
// policy (auth.uid()::text = id) permite las dos operaciones sobre la
// propia fila, así que alcanza con un solo llamado sin consultar antes cuál
// de los dos casos es. Nunca toca points/reportes/reencuentros/hearts/
// streak_days: al no incluirlos en el objeto, el upsert los deja como
// están (o, si la fila es nueva, caen en sus valores default de la tabla).
export async function updateProfile(userId, { nickname, whatsapp }) {
  if (!userId) throw new Error("Necesitás iniciar sesión para editar tu perfil.");
  const { error } = await supabase
    .from(CONTRIBUTORS_TABLE)
    .upsert({ id: userId, nickname, whatsapp: whatsapp || null, updated_at: new Date().toISOString() });
  if (error) {
    if (isMissingColumnError(error, "whatsapp")) {
      throw new Error("Guardar el WhatsApp del perfil todavía no está disponible. Probá de nuevo más tarde.");
    }
    throw error;
  }
}

const SAVED_REPORTS_TABLE = "saved_reports";
const SAVED_REPORTS_MISSING_MSG = "Guardar mascotas todavía no está disponible en este momento. Probá de nuevo más tarde.";

// Solo los ids (no el reporte completo — ver el comentario en schema.sql:
// saved_reports no duplica ningún dato de reports). Falla ABIERTO ante una
// tabla que todavía no existe (sin la migración corrida): "sin guardados"
// en vez de romper toda la pantalla de "Mi Felpus" por una sección que
// nadie llegó a usar todavía.
export async function fetchSavedReportIds(userId) {
  if (!userId) return [];
  const { data, error } = await supabase.from(SAVED_REPORTS_TABLE).select("report_id").eq("user_id", userId);
  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  return (data || []).map((r) => r.report_id);
}

// ignoreDuplicates (insert ... on conflict do nothing) además de la unique
// key compuesta en la base: dos clicks rápidos en "Guardar" (doble toque
// en mobile, red lenta) no revientan con un error de duplicado — el
// resultado es el mismo "ya está guardado" en los dos casos.
export async function saveReport(userId, reportId) {
  if (!userId) throw new Error("Iniciá sesión con Google para guardar mascotas.");
  const { error } = await supabase
    .from(SAVED_REPORTS_TABLE)
    .upsert({ user_id: userId, report_id: reportId }, { onConflict: "user_id,report_id", ignoreDuplicates: true });
  if (error) {
    if (isMissingTableError(error)) throw new Error(SAVED_REPORTS_MISSING_MSG);
    throw error;
  }
}

export async function unsaveReport(userId, reportId) {
  if (!userId) return;
  const { error } = await supabase.from(SAVED_REPORTS_TABLE).delete().eq("user_id", userId).eq("report_id", reportId);
  if (error) {
    if (isMissingTableError(error)) throw new Error(SAVED_REPORTS_MISSING_MSG);
    throw error;
  }
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
// sourceId: auditoría integral (2026-08-09) — el id del reporte que
// originó estos puntos (el que se acaba de publicar, el que se acaba de
// resolver, o el reporte "original" que recibe el bono). La RPC lo usa
// para verificar que el evento sea real y para no otorgar puntos dos veces
// por el mismo reporte (ver el comentario largo junto a award_points en
// schema.sql) — sin esto, cualquier cuenta logueada podía pedirle puntos al
// servidor por cualquier motivo, cuantas veces quisiera.
export async function awardPoints(userId, displayName, delta, reason, sourceId) {
  if (!userId) return;
  const rpcResult = await supabase.rpc("award_points", {
    p_user_id: userId,
    p_display_name: displayName || null,
    p_delta: delta,
    p_reason: reason,
    p_source_id: sourceId,
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
//
// Hallazgo de auditoría de seguridad (2026-08-07): esta era la última
// escritura directa a "contributors" que tocaba columnas sensibles
// (streak_days) sin pasar por una función — igual que awardPoints/sendHeart,
// ahora usa bump_streak (RPC, ver schema.sql), que corre server-side con
// auth.uid() verificado.
//
// REDISEÑO (auditoría integral, 2026-08-09): antes today/yesterday se
// calculaban ACÁ y se los mandaba tal cual al servidor — el servidor
// confiaba ciegamente en esas fechas, así que alcanzaba con mandar
// p_today=mañana, luego pasado mañana, etc. para inflar la racha en loop.
// Ahora solo se manda el TIMEZONE (nombre IANA, ej. "America/Argentina/
// Buenos_Aires") — la fecha "de hoy" la calcula el propio Postgres a partir
// de su reloj real + ese timezone (ver bump_streak en schema.sql), así que
// el cliente ya no puede declarar qué día es. El timezone real sigue
// siendo necesario (no alcanza con la fecha en UTC): sin él, el corte de
// "día" caería a la medianoche UTC, que para Argentina son las 21hs — un
// usuario que abre la app a las 22hs vería "ayer" en vez de "hoy".
export async function bumpStreak(userId, displayName) {
  if (!userId) return null;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const rpcResult = await supabase.rpc("bump_streak", {
    p_user_id: userId,
    p_display_name: displayName || null,
    p_timezone: timezone,
  });
  if (!rpcResult.error) {
    const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
    if (!row) return null;
    return { streakDays: row.streak_days ?? 0, isNewToday: !!row.is_new_today };
  }
  if (!isMissingFunctionError(rpcResult.error)) throw rpcResult.error;

  // Antes de correr la migración que crea bump_streak (ver
  // PENDIENTE_DECISION.md): cae al lee-y-escribe de siempre, calculando
  // today/yesterday en el huso horario local acá mismo (el mismo cálculo
  // que usaba el cliente antes del rediseño de arriba) — sin la migración
  // corrida, esta escritura directa TODAVÍA no está protegida por el
  // revoke de columnas (que se agrega en la misma migración) — es el mismo
  // estado que ya tenía la app antes de este hallazgo, no una regresión
  // nueva.
  const today = localDateStr();
  const yesterday = localDateStr(new Date(Date.now() - 24 * 3600 * 1000));
  const { data: existing, error: fetchError } = await supabase
    .from(CONTRIBUTORS_TABLE)
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (fetchError) throw fetchError;

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
// seedIfEmpty() vivía acá — sembraba reportes y colaboradores de ejemplo la
// primera vez que la tabla estaba vacía, con un "lock" en contributors para
// no duplicar si dos personas abrían la app al mismo tiempo.
//
// Control integral (2026-08-10): quedó rota (y se llamaba en CADA carga de
// la home, sin excepción) desde que se endureció contributors_insert_own
// (`auth.uid()::text = id`, ver schema.sql) — la fila de lock y los
// colaboradores de ejemplo usan ids derivados de nickname, no un
// auth.uid() real, así que ese insert nunca puede pasar la policy para un
// visitante sin sesión. El error se atrapaba en silencio (lockError
// truthy → return), pero el pedido HTTP fallido (401) se disparaba antes
// de eso igual, en cada visita — verificado en vivo contra felpus.com. Se
// quita en vez de "arreglarse" porque ya no hace falta: la base tiene
// contenido real (reportes, reencuentros, colaboradores) desde hace rato.
// Si en el futuro hace falta poblar una base nueva/de demo, tiene que
// hacerse server-side con la service role key (mismo patrón que
// create-report), no desde un cliente anónimo — la RLS ya no lo permite.
// ---------------------------------------------------------------------------
