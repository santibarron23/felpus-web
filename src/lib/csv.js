// Serializador CSV genérico y mínimo (RFC 4180): comillas dobles alrededor
// de cualquier campo con coma/comilla/salto de línea, comillas internas
// escapadas duplicándolas. Sin librería externa — el único uso hoy es el
// informe de usuarios del admin, unas pocas decenas/cientos de filas, no
// miles de reportes.
function escapeCsvField(value) {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(headers, rows) {
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  return lines.join("\r\n");
}

// Informe de usuarios para el panel de admin (ver admin_list_users en
// schema.sql): apodo/email/whatsapp de cada cuenta con login de Google.
// Mismos 3 campos que devuelve la RPC, a propósito — ver el comentario de
// la función SQL sobre por qué no incluye más.
export function usersReportToCsv(users) {
  const headers = ["Apodo", "Email", "WhatsApp"];
  const rows = (users || []).map((u) => [u.nickname || "(sin apodo)", u.email || "", u.whatsapp || ""]);
  return rowsToCsv(headers, rows);
}
