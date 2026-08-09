// Helpers chicos y compartidos por las rutas API sin autenticación de
// sesión (report-contact, flag-report, create-report, embed) — extraídos
// acá porque la misma lógica estaba duplicada letra por letra en cada
// route.js (auditoría integral, 2026-08-09).

// Auditoría de seguridad (2026-08-09): estas rutas hacían `request.json()`
// sin chequear el Content-Type real del pedido. El estándar Fetch API no
// exige que el Content-Type sea "application/json" para que `.json()`
// funcione — solo intenta parsear el body como texto. Eso habilita el
// truco clásico de CSRF sobre APIs JSON: un <form method="POST"
// enctype="text/plain"> es una "simple request" para CORS (no dispara
// preflight), así que el navegador la manda sin bloquear nada aunque el
// body termine siendo JSON válido. Como estas rutas no exigen sesión,
// alguien podía meter ese HTML en una página propia apuntando a
// /api/flag-report con un reportId real, y cada visita real a esa página
// (con su IP real, la misma que se blindó contra spoofing) ocultaba en
// silencio un reporte ajeno apenas juntaba 3 visitas — sin que ninguna de
// esas personas supiera que estaba "denunciando" nada.
//
// Exigir Content-Type: application/json exacto no es una defensa CSRF
// completa (un atacante con más esfuerzo podría rearmar el pedido con
// fetch() desde un sitio bajo su control si además hubiera cookies de
// sesión de por medio — acá no las hay, ver el comentario en cada route.js
// sobre Bearer token vs cookies), pero sí bloquea el vector más simple y
// silencioso: un <form> HTML plano ya no alcanza, porque un <form> nunca
// puede mandar un Content-Type que no sea uno de los 3 "simple" (
// application/x-www-form-urlencoded, multipart/form-data, text/plain).
export function isJsonRequest(request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.toLowerCase().startsWith("application/json");
}

// Misma línea, repetida idéntica en cada route.js — la IP real la
// determina Vercel en el header x-forwarded-for del request que le llega a
// la función serverless (a diferencia del header que ve un cliente
// llamando a Supabase directo, este no lo puede falsificar quien visita el
// sitio). Ver PENDIENTE_DECISION.md #-14 para el hallazgo completo.
export function getClientIp(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}
