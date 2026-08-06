// URL pública canónica de Felpus — un solo lugar, en vez de repetir el
// literal en cada archivo que arma un link absoluto (sitemap, robots.txt,
// JSON-LD, metadata, el mensaje de contacto de WhatsApp/email, las
// notificaciones de coincidencia por email/push). Antes de migrar a
// felpus.com esto vivía duplicado, con el mismo valor, en 7 archivos
// distintos — el riesgo real de esa duplicación no era el day-to-day, era
// justo este momento: cambiar de dominio y olvidarse una de las 7.
//
// OJO: esto NO alcanza al webhook de notificaciones (notify_new_report en
// supabase/schema.sql) — ese vive en Postgres, no en este bundle de JS, así
// que si este valor cambia de nuevo hay que volver a correr esa función en
// el SQL Editor de Supabase a mano.
export const SITE_URL = "https://felpus.com";
