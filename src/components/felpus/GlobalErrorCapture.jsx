"use client";

import { useEffect } from "react";
import { instalarCapturaGlobal } from "../../lib/erroresGlobales";

// Registra los errores que nadie atrapó (ver lib/erroresGlobales.js). No
// muestra nada.
export default function GlobalErrorCapture() {
  useEffect(() => instalarCapturaGlobal(window), []);
  return null;
}
