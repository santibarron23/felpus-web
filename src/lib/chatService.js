// Servidor del Asistente Felpus: arma el pedido a Claude, ejecuta las dos
// herramientas (que solo LEEN reportes públicos o actualizan el borrador que
// vive en el navegador — nunca escriben en la base) y devuelve la respuesta.
// La ruta (src/app/api/chat/route.js) solo hace HTTP: validar el pedido,
// rate limit y llamar a runChat. Así esto se puede testear con un cliente de
// Claude y un fetch falsos.
import {
  DEFAULT_CHAT_MODEL,
  CHAT_MAX_TOKENS,
  MAX_TOOL_ROUNDS,
  CHAT_TOOLS,
  DRAFT_TOOL_NAME,
  SEARCH_TOOL_NAME,
  buildSystemPrompt,
  buildContextNote,
  mergeDraft,
  normalizeDraft,
  missingFields,
  draftReadyForMatching,
  runMatching,
  normalizeSearchInput,
  filterReports,
  reportsQuery,
  openReportForModel,
  contentForEcho,
  toolUsesToRun,
  extractText,
  supportsDefaultFallback,
  estimateCostUsd,
  isDraftEmpty,
  detectAskedField,
  userMentionsSpecies,
} from "./chatbot";

const REFUSAL_REPLY =
  "Perdón, eso no lo puedo responder. Si querés, contame qué pasó con la mascota y te ayudo a buscarla o a armar el reporte.";
const EMPTY_REPLY = "Perdón, no te entendí bien. ¿Me lo contás de nuevo con otras palabras?";

// Lectura de reportes públicos con la anon key (la misma que usa la app en
// el navegador): el chat no necesita más permisos que cualquier visitante.
export function makeReportsReader({ supabaseUrl, anonKey, fetchImpl = fetch }) {
  const cache = new Map();
  async function get(query) {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/reports?${query}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    return res;
  }
  return async function readReports(filter, { limit = 300 } = {}) {
    const key = JSON.stringify([filter, limit]);
    if (cache.has(key)) return cache.get(key);
    // Si falta alguna columna opcional (migración sin correr), se reintenta
    // con las columnas base — mismo criterio que fetchReports en store.js.
    let res = await get(reportsQuery(filter, { limit }));
    if (res.status === 400) res = await get(reportsQuery(filter, { withOptionalColumns: false, limit }));
    if (!res.ok) throw new Error(`Supabase respondió ${res.status}`);
    const rows = await res.json();
    const list = Array.isArray(rows) ? rows.filter((r) => r.oculto !== true) : [];
    cache.set(key, list);
    return list;
  };
}

export async function fetchOpenReport({ supabaseUrl, anonKey, fetchImpl = fetch }, reportId) {
  if (!reportId) return null;
  try {
    const params = new URLSearchParams({
      id: `eq.${reportId}`,
      select: "id,tipo,especie,nombre,color,color_otro,tamano,sexo,zona,fecha,descripcion,resuelto,creado_en",
      limit: "1",
    });
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/reports?${params}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return openReportForModel(Array.isArray(rows) ? rows[0] : null);
  } catch {
    return null;
  }
}

function lastUserWithImage(messages, image) {
  if (!image) return messages;
  const out = messages.map((m) => ({ ...m }));
  const last = out[out.length - 1];
  last.content = [
    { type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } },
    { type: "text", text: typeof last.content === "string" ? last.content : "" },
  ];
  return out;
}

function addUsage(total, usage) {
  if (!usage) return;
  for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) {
    total[k] = (total[k] || 0) + (usage[k] || 0);
  }
}

export function pendingFor({ draft, draftChanged, reply, context, image }) {
  if (!(reply || "").includes("?")) return null;
  // Primero lo que de verdad pregunta el texto; si no se reconoce, el
  // primer dato que falta (que es lo que el prompt le pide preguntar).
  // Va ANTES del chequeo de borrador vacío (2026-10-22): la primera
  // pregunta ("¿perdiste una mascota o encontraste una?") llega con el
  // borrador todavía vacío, y sin esto no mostraba los botones y había que
  // escribir la respuesta (visto en un iPhone real).
  const asked = detectAskedField(reply);
  if (asked) return asked;
  if (isDraftEmpty(draft)) return null;
  if (!draftChanged) return null;
  return missingFields(draft, { hasPhoto: context.hasPhoto || !!image, skipped: context.skipped })[0]?.clave || null;
}

// runChat -> { reply, draft?, pending?, matches?, results?, refused? }
export async function runChat({
  client,
  model = DEFAULT_CHAT_MODEL,
  messages,
  draft: incomingDraft,
  context,
  image,
  readReports,
  openReport = null,
  now = new Date(),
  log = () => {},
}) {
  let draft = normalizeDraft(incomingDraft);
  let draftChanged = false;
  let matches;
  let results;
  let searchFilters;
  const toolsUsed = [];
  const usage = {};
  const startedAt = Date.now();

  const contextNote = buildContextNote({
    section: context.section,
    draft: isDraftEmpty(draft) ? null : draft,
    hasPhoto: context.hasPhoto || !!image,
    openReport,
  });

  const convo = [
    ...lastUserWithImage(messages, image),
    // Mensaje de sistema a mitad de conversación: el canal del operador
    // (Felpus) para el contexto de esta vuelta, separado del texto de la
    // persona y sin tocar el prompt de sistema (que así queda cacheado).
    { role: "system", content: contextNote },
  ];

  async function executeTool(block) {
    toolsUsed.push(block.name);
    if (block.name === DRAFT_TOOL_NAME) {
      const input = { ...(block.input || {}) };
      // Especie inventada (ver userMentionsSpecies): se descarta y se pregunta.
      let especieDescartada = false;
      if (input.especie && !draft.especie && !image && !context.hasPhoto && !userMentionsSpecies(messages)) {
        input.especie = "";
        especieDescartada = true;
      }
      draft = mergeDraft(draft, input);
      draftChanged = true;
      let coincidencias = null;
      if (draftReadyForMatching(draft)) {
        const rows = await readReports({ tipo: draft.tipo === "perdida" ? "encontrada" : "perdida", especie: draft.especie });
        const m = runMatching(draft, rows);
        matches = m.cards;
        coincidencias = m.forModel;
      }
      return {
        guardado: true,
        // Sin coordenadas exactas (ver buildContextNote).
        borrador: { ...draft, lat: undefined, lng: undefined, punto_en_mapa: draft.lat != null },
        faltan: missingFields(draft, { hasPhoto: context.hasPhoto || !!image, skipped: context.skipped }),
        // Sin esto el modelo se disculpaba ("el perro lo puse por error").
        ...(especieDescartada ? { nota: "La persona todavía no dijo si es perro o gato: preguntalo sin mencionar el borrador ni disculparte." } : {}),
        coincidencias,
      };
    }
    if (block.name === SEARCH_TOOL_NAME) {
      searchFilters = normalizeSearchInput(block.input);
      const rows = await readReports(
        { tipo: searchFilters.tipo, especie: searchFilters.especie },
        { limit: 500 }
      );
      const r = filterReports(rows, searchFilters, now.getTime());
      results = r.cards;
      return { filtros: searchFilters, ...r.forModel };
    }
    throw new Error(`Herramienta desconocida: ${block.name}`);
  }

  let reply = "";
  let refused = false;
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const params = {
      model,
      max_tokens: CHAT_MAX_TOKENS,
      system: buildSystemPrompt(now),
      tools: CHAT_TOOLS,
      // Charla corta: esfuerzo bajo (menos tokens, respuesta más rápida).
      output_config: { effort: "low" },
      // Caché automático: el prompt y las herramientas no cambian entre
      // mensajes, y dentro de una misma vuelta con herramientas se reusa todo.
      cache_control: { type: "ephemeral" },
      messages: convo,
    };
    // En la última vuelta permitida ya no se ofrecen herramientas: hay que
    // responder con lo que hay.
    if (round === MAX_TOOL_ROUNDS) params.tool_choice = { type: "none" };
    if (supportsDefaultFallback(model)) {
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
    }
    const response = await client.beta.messages.create(params);
    addUsage(usage, response.usage);

    if (response.stop_reason === "refusal") {
      refused = true;
      reply = REFUSAL_REPLY;
      break;
    }
    if (response.stop_reason === "pause_turn") {
      convo.push({ role: "assistant", content: contentForEcho(response.content) });
      continue;
    }
    const toolUses = toolUsesToRun(response.content);
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      reply = extractText(response.content);
      break;
    }
    convo.push({ role: "assistant", content: contentForEcho(response.content) });
    const toolResults = [];
    for (const block of toolUses) {
      try {
        const result = await executeTool(block);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (e) {
        log("tool_error", { tool: block.name, message: String(e?.message || e).slice(0, 200) });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: "No se pudo completar esta consulta ahora. Decile a la persona que lo intente de nuevo en un rato.",
        });
      }
    }
    convo.push({ role: "user", content: toolResults });
  }

  // Métrica de consumo: sin texto de la conversación ni IP.
  log("chat_usage", {
    model,
    section: context.section,
    tools: toolsUsed,
    with_image: !!image,
    refused,
    ms: Date.now() - startedAt,
    ...usage,
    cost_usd: Number(estimateCostUsd(model, usage).toFixed(5)),
  });

  return {
    reply: reply || EMPTY_REPLY,
    ...(draftChanged ? { draft } : {}),
    // Qué está preguntando el asistente, para que la app muestre los botones
    // de respuesta rápida de ESE dato. Antes solo salía si el modelo había
    // guardado el borrador en esta vuelta — visto en producción: con "Perdí a
    // mi mascota" el modelo preguntaba "¿perro o gato?" sin guardar nada y no
    // aparecían botones. Ahora alcanza con que haya un reporte en curso y la
    // respuesta termine en pregunta.
    ...(pendingFor({ draft, draftChanged, reply, context, image }) ? { pending: pendingFor({ draft, draftChanged, reply, context, image }) } : {}),
    ...(matches ? { matches } : {}),
    ...(results ? { results, searchFilters } : {}),
    ...(refused ? { refused: true } : {}),
  };
}
