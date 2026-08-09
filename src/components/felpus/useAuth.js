"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { logError } from "../../lib/log";
import { loadGoogleIdentity, generateNonce } from "../../lib/googleAuth";

// Sesión con Google (opcional) — sin login, se puede seguir aportando como
// invitado escribiendo un apodo a mano. Solo posee lo que es genuinamente
// "sesión": el user de Supabase Auth y las acciones de entrar/salir. Racha,
// apodo y "coincidencias vistas" quedan afuera a propósito — dependen de
// otras piezas de estado (puntos, nickname) que no le corresponden a este
// hook, así que las sigue manejando quien lo usa.
export function useAuth(pushToast) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Refs, no state: no necesitan disparar un re-render — solo los lee
  // signInWithGoogle() en el momento del clic.
  const identityReadyRef = useRef(false);
  const nonceRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    // Auditoría integral (2026-08-09): onAuthStateChange dispara también en
    // TOKEN_REFRESHED (Supabase renueva el JWT solo, típicamente cada ~1h
    // con la pestaña abierta) — session.user es un objeto RECONSTRUIDO en
    // cada evento, mismo contenido pero referencia nueva. Como varios
    // efectos de FelpusMatcher.jsx dependen de [user] (recarga de reportes,
    // leaderboard, guardados, racha), cualquier sesión abierta más de una
    // hora terminaba disparando una recarga completa sin que hubiera pasado
    // nada real — multiplicaba queries a Supabase sin motivo. setUser acá
    // solo cambia de referencia cuando la IDENTIDAD real cambia (login/
    // logout/otra cuenta), no en cada refresh de token silencioso.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((prev) => (prev?.id === (session?.user?.id ?? null) ? prev : session?.user ?? null));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Google Identity Services (ID token) — opcional, en segundo plano. Sin
  // NEXT_PUBLIC_GOOGLE_CLIENT_ID configurada (ver .env.local.example),
  // identityReadyRef.current nunca pasa a true y signInWithGoogle() usa el
  // flujo clásico con redirect de siempre, sin ningún cambio de
  // comportamiento — mismo patrón de "mejora opcional, con respaldo" que
  // Google Maps o las notificaciones push en este mismo proyecto.
  //
  // Por qué esto existe: el flujo clásico (signInWithOAuth) rebota por el
  // dominio propio del proyecto de Supabase antes de volver a felpus.com —
  // la pantalla "Elige una cuenta" de Google, de paso, le muestra ese
  // dominio de Supabase al usuario ("Ir a xxxx.supabase.co"), no felpus.com.
  // Este flujo alternativo corre 100% embebido en la propia página, así que
  // ese mismo cartel termina reflejando el origen real. Ver
  // PENDIENTE_DECISION.md para el detalle y los pasos de configuración.
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      try {
        const googleId = await loadGoogleIdentity();
        const { nonce, hashedNonce } = await generateNonce();
        if (cancelled) return;
        nonceRef.current = nonce;
        googleId.initialize({
          client_id: clientId,
          callback: async (response) => {
            const { error } = await supabase.auth.signInWithIdToken({
              provider: "google",
              token: response.credential,
              nonce: nonceRef.current,
            });
            if (error) {
              logError(error);
              pushToast("error", "No pudimos iniciar sesión con Google.");
            }
          },
          nonce: hashedNonce,
          auto_select: false,
          use_fedcm_for_prompt: true,
        });
        if (!cancelled) identityReadyRef.current = true;
      } catch (e) {
        // Falla silenciosa a propósito: identityReadyRef se queda en false,
        // así que signInWithGoogle() sigue usando el flujo clásico como si
        // esto no existiera. Un bloqueador de anuncios, un adblock de
        // scripts de Google, o un corte de red acá no debe romper el login.
        logError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  const googleDisplayName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || null;
  const googleAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  // Flujo clásico con redirect — el de siempre, sin cambios. Es el único
  // camino cuando no hay Client ID configurado, y el respaldo automático
  // cuando el One Tap de Google no se puede mostrar (ver signInWithGoogle).
  const signInWithOAuthRedirect = useCallback(async () => {
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      });
    } catch (e) {
      logError(e);
      pushToast("error", "No pudimos abrir el inicio de sesión con Google.");
    }
  }, [pushToast]);

  const signInWithGoogle = useCallback(async () => {
    if (!identityReadyRef.current || typeof window === "undefined" || !window.google?.accounts?.id) {
      return signInWithOAuthRedirect();
    }
    let settled = false;
    window.google.accounts.id.prompt((notification) => {
      if (settled) return;
      // isNotDisplayed/isSkippedMoment: Google no pudo (o no quiso) mostrar
      // el cartel de One Tap en este intento — enfriamiento por un cierre
      // anterior, navegador sin soporte, cookies de terceros bloqueadas,
      // etc. El flujo clásico sigue siendo el único respaldo confiable ahí.
      if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
        settled = true;
        signInWithOAuthRedirect();
      }
    });
  }, [signInWithOAuthRedirect]);

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  return { user, authLoading, googleDisplayName, googleAvatar, signInWithGoogle, signOut };
}
