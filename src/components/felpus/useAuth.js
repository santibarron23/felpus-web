"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { logError } from "../../lib/log";

// Sesión con Google (opcional) — sin login, se puede seguir aportando como
// invitado escribiendo un apodo a mano. Solo posee lo que es genuinamente
// "sesión": el user de Supabase Auth y las acciones de entrar/salir. Racha,
// apodo y "coincidencias vistas" quedan afuera a propósito — dependen de
// otras piezas de estado (puntos, nickname) que no le corresponden a este
// hook, así que las sigue manejando quien lo usa.
export function useAuth(pushToast) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const googleDisplayName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || null;
  const googleAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  async function signInWithGoogle() {
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      });
    } catch (e) {
      logError(e);
      pushToast("error", "No pudimos abrir el inicio de sesión con Google.");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  return { user, authLoading, googleDisplayName, googleAvatar, signInWithGoogle, signOut };
}
