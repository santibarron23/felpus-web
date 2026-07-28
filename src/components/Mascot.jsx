"use client";

// Felpi, la mascota guía de Felpus — un perrito simple y expresivo (estilo
// vectorial plano, acorde a la marca) que acompaña momentos clave: estados
// vacíos, publicación exitosa, búsqueda en curso y reencuentros confirmados.
// `mood` controla la expresión: "happy" (default), "searching", "celebrating",
// "waiting". Todo es SVG a mano, sin dependencias externas.

const PALETTE = {
  fur: "#E8B87D",
  furDark: "#D19F63",
  ear: "#C98B4A",
  cream: "#FBF7F0",
  ink: "#2B1B12",
  red: "#D31C22",
  pink: "#F4A6A6",
};

function Face({ mood }) {
  const blinking = mood === "celebrating";
  const searching = mood === "searching";
  return (
    <>
      {/* orejas */}
      <path d="M55 55 C30 45 25 90 45 105 C55 100 60 75 55 55 Z" fill={PALETTE.ear} />
      <path d="M145 55 C170 45 175 90 155 105 C145 100 140 75 145 55 Z" fill={PALETTE.ear} />
      {/* cabeza */}
      <circle cx="100" cy="105" r="62" fill={PALETTE.fur} />
      {/* hocico */}
      <ellipse cx="100" cy="125" rx="30" ry="22" fill={PALETTE.cream} />
      {/* ojos */}
      {blinking ? (
        <>
          <path d="M72 92 Q80 84 88 92" stroke={PALETTE.ink} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M112 92 Q120 84 128 92" stroke={PALETTE.ink} strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      ) : searching ? (
        <>
          <ellipse cx="80" cy="92" rx="6" ry="4" fill={PALETTE.ink} />
          <ellipse cx="120" cy="92" rx="6" ry="4" fill={PALETTE.ink} />
        </>
      ) : (
        <>
          <circle cx="80" cy="92" r="7" fill={PALETTE.ink} />
          <circle cx="120" cy="92" r="7" fill={PALETTE.ink} />
          <circle cx="82.5" cy="89" r="2.2" fill="#fff" />
          <circle cx="122.5" cy="89" r="2.2" fill="#fff" />
        </>
      )}
      {/* nariz */}
      <ellipse cx="100" cy="118" rx="9" ry="7" fill={PALETTE.ink} />
      {/* boca */}
      {mood === "celebrating" ? (
        <path d="M82 130 Q100 150 118 130" stroke={PALETTE.ink} strokeWidth="4" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M100 125 Q100 135 88 133 M100 135 Q100 135 112 133" stroke={PALETTE.ink} strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
      {/* lengua (feliz/celebrando) */}
      {(mood === "happy" || mood === "celebrating") && (
        <ellipse cx="100" cy="141" rx="8" ry="11" fill={PALETTE.pink} />
      )}
      {/* colar con dije de corazón (marca Felpus) */}
      <path d="M62 150 Q100 168 138 150" stroke={PALETTE.red} strokeWidth="7" fill="none" strokeLinecap="round" />
      <circle cx="100" cy="168" r="7" fill={PALETTE.red} />
    </>
  );
}

export default function Mascot({ mood = "happy", size = 96, className = "" }) {
  const label =
    mood === "searching"
      ? "Felpi buscando coincidencias"
      : mood === "celebrating"
        ? "Felpi festejando"
        : "Felpi, la mascota de Felpus";
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={label}
    >
      <Face mood={mood} />
      {mood === "searching" && (
        <g transform="translate(132,118) rotate(20)">
          <circle cx="0" cy="0" r="17" fill="none" stroke={PALETTE.ink} strokeWidth="5" />
          <line x1="12" y1="12" x2="26" y2="26" stroke={PALETTE.ink} strokeWidth="6" strokeLinecap="round" />
        </g>
      )}
      {mood === "celebrating" && (
        <g fill={PALETTE.red}>
          <circle cx="35" cy="55" r="4" />
          <circle cx="165" cy="60" r="5" />
          <circle cx="45" cy="150" r="3.5" />
          <circle cx="160" cy="145" r="4" />
        </g>
      )}
    </svg>
  );
}
