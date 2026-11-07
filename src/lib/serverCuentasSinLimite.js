// Servidor: ¿el pedido viene de una cuenta sin cupos? (ver cuentasSinLimite.js)
// Solo consulta a Supabase Auth si el pedido trae sesión; el email sale del
// token verificado, nunca de lo que mande el navegador.
import { esCuentaSinLimite } from "./cuentasSinLimite";
import { getAuthUser, supabaseServerEnv } from "./serverAuth";

export async function pedidoSinLimite(request, env = supabaseServerEnv(), { obtenerUsuario = getAuthUser } = {}) {
  if (!(request.headers.get("authorization") || "").startsWith("Bearer ")) return false;
  const user = await obtenerUsuario(request, env);
  return esCuentaSinLimite(user?.email);
}
