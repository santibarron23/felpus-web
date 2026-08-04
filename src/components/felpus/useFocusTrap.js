"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Atrapa el foco de teclado dentro de containerRef mientras `active` es
// true, y lo devuelve a lo que tenía el foco antes al desactivarse/desmontar
// — sin esto, Tab se escapaba del modal/bottom sheet hacia el contenido de
// atrás, que sigue siendo interactivo aunque esté tapado visualmente.
export function useFocusTrap(active, containerRef) {
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    previousFocusRef.current = document.activeElement;

    function getFocusables() {
      const container = containerRef.current;
      if (!container) return [];
      return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null
      );
    }

    // El contenido recién se porta al DOM (createPortal) — un tick después
    // ya está montado, así que el primer foco se agenda para el próximo
    // frame en vez de intentarlo de forma síncrona.
    const raf = requestAnimationFrame(() => {
      getFocusables()[0]?.focus();
    });

    function handleKeyDown(e) {
      if (e.key !== "Tab") return;
      const items = getFocusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [active, containerRef]);
}
