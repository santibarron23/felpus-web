"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Atrapa el foco de teclado dentro de containerRef mientras `active` es
// true, y lo devuelve a lo que tenía el foco antes al desactivarse/desmontar
// — sin esto, Tab se escapaba del modal/bottom sheet hacia el contenido de
// atrás, que sigue siendo interactivo aunque esté tapado visualmente.
//
// `onEscape` (opcional) además cierra con la tecla Escape — hallazgo de
// auditoría: ni DetailModal ni FilterSheet la tenían (solo se podían cerrar
// con el mouse/touch, tocando el fondo o el botón "X"), algo que tanto
// WCAG como el patrón estándar de diálogo (WAI-ARIA Authoring Practices)
// esperan como comportamiento básico de cualquier modal.
export function useFocusTrap(active, containerRef, onEscape) {
  const previousFocusRef = useRef(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

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
      if (e.key === "Escape") {
        // onEscapeRef (no `onEscape` directo): así este listener no necesita
        // quedar en las dependencias del efecto — evita sacar y volver a
        // poner el listener (y perder/reagendar el foco) cada vez que el
        // componente que llama a este hook pasa una nueva función inline.
        onEscapeRef.current?.();
        return;
      }
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
