import FelpusMatcher from "../components/FelpusMatcher";
import { fetchHomeStats } from "../lib/homeStats";

// Los números de Inicio vienen en el HTML (ver homeStats.js): la página se
// regenera como mucho cada 60 s (ISR), así que entrar no espera a la base.
export const revalidate = 60;

export default async function Page() {
  const initialStats = await fetchHomeStats();
  return <FelpusMatcher initialStats={initialStats} />;
}
