// Cuentas que cargan avisos sin cupos (2026-11-07, pedido del usuario): la
// cuenta de Felpus, que sube en tanda avisos de otras redes. No pasan por
// los cupos de publicar, subir fotos, leer flyers con IA, vectores ni
// chequeo de fotos (ver serverCuentasSinLimite.js). Sus pedidos tampoco
// cuentan para los topes globales, así que no le quitan lugar a nadie.
//
// La decisión real es siempre del servidor, con el email verificado de la
// sesión de Supabase (Google). Esta lista también la usa el navegador, solo
// para saber cuándo mandar la sesión a esas rutas: así el resto de las
// cuentas no suma una consulta de más por pedido.
export const CUENTAS_SIN_LIMITE = ["contacto.felpus@gmail.com"];

export function esCuentaSinLimite(email) {
  return typeof email === "string" && CUENTAS_SIN_LIMITE.includes(email.trim().toLowerCase());
}

// Navegador: header con la sesión si es una cuenta sin cupos; si no, vacío.
export async function headerCuentaSinLimite() {
  try {
    const { supabase } = await import("./supabaseClient");
    const session = (await supabase.auth.getSession())?.data?.session;
    if (session?.access_token && esCuentaSinLimite(session.user?.email)) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // Sin sesión o sin Supabase: como cualquier otra persona.
  }
  return {};
}
