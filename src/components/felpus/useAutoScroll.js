"use client";

import { useEffect, useRef, useState } from "react";

// Desplazamiento automático y lento de una fila horizontal (2026-11-03,
// "Reencuentros felices"): las tarjetas pasan solas de derecha a izquierda.
// La fila tiene que tener la lista DOS veces seguidas, con data-bucle="copia"
// en el primer elemento de la segunda: al llegar ahí se vuelve exactamente
// esa distancia atrás y el bucle no se nota.
//
// Se frena sola con el mouse encima, mientras se toca (y unos segundos
// después), con el foco del teclado adentro, con la pestaña oculta y si la
// persona pidió menos movimiento en su sistema. `pausado` es la pausa a mano
// (botón visible: WCAG 2.2.2, contenido que se mueve solo).

export const VELOCIDAD_PX_S = 30;
const REANUDAR_TRAS_TOQUE_MS = 4000;

// Nueva posición después de `dt` ms (un salto largo, por ejemplo al volver a
// la pestaña, cuenta como 100 ms). `periodo`: distancia hasta la copia.
export function siguientePosicion(pos, dtMs, periodo, velocidad = VELOCIDAD_PX_S) {
  if (!(periodo > 0)) return pos;
  let p = pos + (velocidad * Math.min(Math.max(dtMs, 0), 100)) / 1000;
  while (p >= periodo) p -= periodo;
  return p;
}

function periodoDe(el) {
  const copia = el.querySelector('[data-bucle="copia"]');
  const primero = el.firstElementChild;
  return copia && primero ? copia.offsetLeft - primero.offsetLeft : 0;
}

export function useAutoScroll(ref, { activo = true } = {}) {
  const [pausado, setPausado] = useState(false);
  const [reducirMovimiento, setReducirMovimiento] = useState(false);
  const frenos = useRef({ hover: false, toque: false, foco: false });
  const posicion = useRef(0);
  const reanudar = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReducirMovimiento(mq.matches);
    const onChange = (e) => setReducirMovimiento(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !activo || pausado || reducirMovimiento) return;
    const f = frenos.current;
    const on = (k) => () => (f[k] = true);
    const off = (k) => () => (f[k] = false);
    const onToque = () => {
      f.toque = true;
      clearTimeout(reanudar.current);
    };
    const finToque = () => {
      clearTimeout(reanudar.current);
      reanudar.current = setTimeout(() => {
        f.toque = false;
        // Si la persona la movió a mano, se sigue desde ahí.
        posicion.current = el.scrollLeft;
      }, REANUDAR_TRAS_TOQUE_MS);
    };
    const listeners = [
      ["mouseenter", on("hover")],
      ["mouseleave", off("hover")],
      ["focusin", on("foco")],
      ["focusout", off("foco")],
      ["touchstart", onToque],
      ["touchend", finToque],
      ["touchcancel", finToque],
      ["wheel", () => { onToque(); finToque(); }],
    ];
    for (const [ev, fn] of listeners) el.addEventListener(ev, fn, { passive: true });

    posicion.current = el.scrollLeft;
    let anterior = null;
    let frame = requestAnimationFrame(function paso(t) {
      const dt = anterior == null ? 0 : t - anterior;
      anterior = t;
      if (!f.hover && !f.toque && !f.foco && !document.hidden && el.scrollWidth > el.clientWidth) {
        posicion.current = siguientePosicion(posicion.current, dt, periodoDe(el));
        el.scrollLeft = posicion.current;
      } else {
        posicion.current = el.scrollLeft;
      }
      frame = requestAnimationFrame(paso);
    });

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(reanudar.current);
      for (const [ev, fn] of listeners) el.removeEventListener(ev, fn);
    };
  }, [ref, activo, pausado, reducirMovimiento]);

  return { pausado, setPausado, reducirMovimiento };
}
