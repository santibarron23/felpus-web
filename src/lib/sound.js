// Efectos de sonido cortos y sintetizados (sin archivos de audio externos),
// al estilo de los "clicks" y "dings" de Duolingo — un tap suave para
// botones principales, y un pequeño acorde ascendente para logros (reporte
// publicado, reencuentro confirmado).
let audioCtx = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone(ctx, freq, startTime, duration, gain, type) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.008);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gainNode).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

// Tap suave para botones principales (navegación, CTAs, publicar).
export function playTap() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    tone(ctx, 740, ctx.currentTime, 0.08, 0.1, "sine");
  } catch {
    // el audio nunca debe romper la interacción
  }
}

// Acorde ascendente para logros: reporte publicado, reencuentro confirmado.
export function playSuccess() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    tone(ctx, 523.25, now, 0.16, 0.13, "sine");
    tone(ctx, 659.25, now + 0.09, 0.16, 0.13, "sine");
    tone(ctx, 783.99, now + 0.18, 0.24, 0.15, "sine");
  } catch {
    // el audio nunca debe romper la interacción
  }
}
