"use client";

import { Facebook, Instagram } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { SOCIAL_LINKS } from "../../lib/site";

const NETWORKS = [
  { key: "instagram", label: "Instagram", Icon: Instagram },
  { key: "facebook", label: "Facebook", Icon: Facebook },
];

// Íconos de las redes oficiales para los footers (home, página local,
// páginas legales). Lee SOCIAL_LINKS de lib/site.js: una red en null no se
// renderiza, así que activar una nueva es solo completar su URL ahí.
export default function SocialLinks({ className = "" }) {
  const C = useTheme();
  const items = NETWORKS.filter((n) => SOCIAL_LINKS[n.key]);
  if (!items.length) return null;
  return (
    <p className={`flex items-center gap-2 justify-center ${className}`}>
      <span className="text-[11px]" style={{ color: C.muted }}>
        Seguinos:
      </span>
      {items.map(({ key, label, Icon }) => (
        <a
          key={key}
          href={SOCIAL_LINKS[key]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Felpus en ${label}`}
          title={`Felpus en ${label}`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full border hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 bg-white dark:bg-[var(--felpus-dark-card)]"
          style={{ borderColor: C.border, color: C.red }}
        >
          <Icon className="w-4 h-4" />
        </a>
      ))}
    </p>
  );
}
