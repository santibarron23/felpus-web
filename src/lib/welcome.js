// Tarjeta de bienvenida de Inicio: si ya se descartó (o se terminó la guía,
// ver OnboardingTutorial.jsx). Separado del componente para que Inicio no
// tenga que cargar la guía entera solo para saber si mostrar la tarjeta.
// Tarjeta de bienvenida descartada (o guía terminada): no vuelve a aparecer.
export const WELCOME_DISMISSED_KEY = "felpus_bienvenida_vista";

export function markWelcomeSeen() {
  try {
    localStorage.setItem(WELCOME_DISMISSED_KEY, "1");
  } catch {
    // sin localStorage: la tarjeta puede volver a aparecer, no es grave
  }
}

export function welcomeSeen() {
  try {
    return localStorage.getItem(WELCOME_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}
