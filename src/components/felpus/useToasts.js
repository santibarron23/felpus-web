"use client";

import { useCallback, useState } from "react";

const TOAST_DURATION_MS = 4200;

// Cola de hasta 3 toasts (los más viejos se descartan solos) — sin estado ni
// dependencias externas, por eso es el primer pedazo que se saca del
// componente gigante FelpusMatcher.
export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const pushToast = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_DURATION_MS);
  }, []);

  return { toasts, pushToast };
}
