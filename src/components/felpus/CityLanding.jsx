"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, MapPin, PawPrint, Search, Share2, Stethoscope, Camera } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import SocialLinks from "./SocialLinks";

// Vista de /mascotas-perdidas/<ciudad> — mismo lenguaje visual que
// LegalPage.jsx (header con logo, tarjetas felpus-display, paleta vía
// useTheme()). Es "use client" solo por useTheme(): todos los datos
// (reportes, FAQ) llegan ya resueltos como props desde el page.js, que es
// Server Component, así que el texto completo va en el HTML que ve Google.

function especieLabel(r) {
  if (r.especie === "perro") return "Perro";
  if (r.especie === "gato") return "Gato";
  return "Mascota";
}

function ReportCard({ r, C }) {
  const perdida = r.tipo === "perdida";
  const titulo = r.nombre ? `${r.nombre} (${especieLabel(r).toLowerCase()})` : especieLabel(r);
  return (
    <li>
      <Link
        href={`/r/${encodeURIComponent(r.id)}`}
        className="flex gap-3 rounded-xl border p-2.5 h-full hover:shadow-sm transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 bg-white dark:bg-[var(--felpus-dark-card)]"
        style={{ borderColor: C.border }}
      >
        {r.foto_url && (
          // Antes <img> con la foto original (~100 KB, hasta 1000 px) para
          // mostrarla a 80 px: unos 2 MB en celular para la lista de Salta.
          // Con next/image pide 128/256 px, los mismos anchos que las
          // miniaturas de la app, así que reutiliza su caché en Vercel en vez
          // de sumar transformaciones nuevas.
          <Image
            src={r.foto_url}
            alt={`${perdida ? "Perdido" : "Encontrado"}: ${titulo} en ${r.zona}`}
            width={80}
            height={80}
            loading="lazy"
            className="w-20 h-20 rounded-lg object-cover shrink-0"
          />
        )}
        <div className="min-w-0">
          <span
            className="inline-block text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 text-white"
            // Mismos colores de estado que la app: verde es solo para reencuentros.
            style={{ background: perdida ? C.redSolid : C.orangeInkSolid }}
          >
            {perdida ? "Perdida" : "Encontrada"}
          </span>
          <h3 className="text-sm font-semibold mt-1 truncate" style={{ color: C.text }}>
            {titulo}
          </h3>
          <p className="text-xs flex items-center gap-1 truncate" style={{ color: C.muted }}>
            <MapPin className="w-3 h-3 shrink-0" /> {r.zona}
          </p>
          {r.descripcion && (
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: C.text }}>
              {r.descripcion}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

function Section({ title, children, C, id }) {
  return (
    <section id={id} className="scroll-mt-4">
      <h2 className="felpus-display text-lg sm:text-xl mb-3" style={{ color: C.text }}>
        {title}
      </h2>
      <div className="text-[13.5px] sm:text-sm leading-relaxed space-y-3" style={{ color: C.text }}>
        {children}
      </div>
    </section>
  );
}

export default function CityLanding({ city, perdidas, encontradas, reencuentros, faqs }) {
  const C = useTheme();
  const n = city.name;
  const card = "rounded-2xl border p-5 sm:p-7 bg-white dark:bg-[var(--felpus-dark-card)]";
  const pasos = [
    { icon: Camera, t: "Publicá en Felpus en minutos", d: "Subí hasta 3 fotos, marcá en el mapa dónde la viste por última vez y dejá un WhatsApp o email de contacto." },
    { icon: Search, t: "Revisá las coincidencias", d: `Felpus compara tu reporte con las mascotas encontradas en ${n} por foto, descripción y cercanía.` },
    { icon: Share2, t: "Compartí el flyer", d: "Descargá el flyer con QR y compartilo en los grupos de WhatsApp y Facebook de tu barrio." },
    { icon: Stethoscope, t: "Avisá a veterinarias y vecinos", d: "Las veterinarias y refugios cercanos suelen ser el primer lugar al que llevan a una mascota encontrada." },
  ];

  return (
    <div className="min-h-screen" style={{ background: C.cream }}>
      <header className="bg-white dark:bg-[var(--felpus-dark-muted-surface)] border-b" style={{ borderColor: C.border }}>
        <div className="max-w-3xl mx-auto px-4 pt-5 pb-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo_full_red.webp" alt="Felpus" width={185} height={108} className="h-8 w-auto object-contain" />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-semibold shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 rounded-lg px-1 py-0.5"
            style={{ color: C.muted }}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Ir a Felpus
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <nav aria-label="Ruta" className="text-[11px]" style={{ color: C.muted }}>
          <Link href="/" className="underline underline-offset-2">Felpus</Link> <span aria-hidden="true">›</span> Mascotas perdidas en {n}
        </nav>

        <div className={card} style={{ borderColor: C.border }}>
          <h1 className="felpus-display text-2xl sm:text-[32px] leading-tight" style={{ color: C.text }}>
            Mascotas perdidas y encontradas en {n}
          </h1>
          <p className="text-sm sm:text-base mt-3 leading-relaxed" style={{ color: C.text }}>
            ¿Se te perdió tu perro o tu gato en {n}, o encontraste uno en la calle? Felpus es un buscador gratuito que
            cruza automáticamente los reportes de mascotas perdidas con los de mascotas encontradas en {n} por foto,
            descripción y zona, para que vuelvan a casa más rápido.
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
              style={{ background: C.red }}
            >
              <PawPrint className="w-4 h-4" /> Reportar una mascota
            </Link>
            <a
              href="#perdidas"
              className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
              style={{ borderColor: C.border, color: C.text }}
            >
              <Search className="w-4 h-4" /> Ver mascotas perdidas en {n}
            </a>
          </div>
          <p className="text-xs mt-4" style={{ color: C.muted }}>
            Ahora mismo: {perdidas.length} {perdidas.length === 1 ? "mascota perdida" : "mascotas perdidas"} y{" "}
            {encontradas.length} {encontradas.length === 1 ? "encontrada" : "encontradas"} en {n}
            {reencuentros > 0 ? ` · ${reencuentros} ${reencuentros === 1 ? "reencuentro" : "reencuentros"} logrados` : ""}.
          </p>
        </div>

        <div className={card} style={{ borderColor: C.border }}>
          <Section id="perdidas" title={`Perros y gatos perdidos en ${n}`} C={C}>
            {perdidas.length ? (
              <ul className="grid sm:grid-cols-2 gap-2.5">
                {perdidas.map((r) => <ReportCard key={r.id} r={r} C={C} />)}
              </ul>
            ) : (
              <p>No hay mascotas perdidas reportadas en {n} en este momento. Si perdiste la tuya, sé el primero en publicarla.</p>
            )}
          </Section>
        </div>

        <div className={card} style={{ borderColor: C.border }}>
          <Section id="encontradas" title={`Mascotas encontradas en ${n}`} C={C}>
            <p>¿Reconocés a alguna? Tocala para ver la ficha completa y contactar a quien la encontró.</p>
            {encontradas.length ? (
              <ul className="grid sm:grid-cols-2 gap-2.5">
                {encontradas.map((r) => <ReportCard key={r.id} r={r} C={C} />)}
              </ul>
            ) : (
              <p>Por ahora no hay mascotas encontradas reportadas en {n}.</p>
            )}
          </Section>
        </div>

        <div className={card} style={{ borderColor: C.border }}>
          <Section title={`Qué hacer si perdiste tu mascota en ${n}`} C={C}>
            <ol className="grid sm:grid-cols-2 gap-3">
              {pasos.map(({ icon: Icon, t, d }, i) => (
                <li key={t} className="rounded-xl border p-3" style={{ borderColor: C.border }}>
                  <p className="font-semibold flex items-center gap-1.5">
                    <Icon className="w-4 h-4" style={{ color: C.red }} /> {i + 1}. {t}
                  </p>
                  <p className="text-xs mt-1" style={{ color: C.muted }}>{d}</p>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div className={card} style={{ borderColor: C.border }}>
          <Section title={`Barrios de ${n} donde funciona Felpus`} C={C}>
            <p>
              Podés reportar y buscar mascotas en toda la ciudad de {n} y el Gran {n}, marcando el punto exacto en el
              mapa. Felpus prioriza las coincidencias más cercanas a tu zona.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {city.barrios.map((b) => (
                <li key={b} className="text-xs rounded-full border px-2.5 py-1" style={{ borderColor: C.border, color: C.text }}>
                  {b}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className={card} style={{ borderColor: C.border }}>
          <Section title="Preguntas frecuentes" C={C}>
            <div className="space-y-2">
              {faqs.map((f) => (
                <details key={f.q} className="rounded-xl border p-3 group" style={{ borderColor: C.border }}>
                  <summary className="font-semibold cursor-pointer">{f.q}</summary>
                  <p className="mt-2" style={{ color: C.text }}>{f.a}</p>
                </details>
              ))}
            </div>
          </Section>
        </div>
      </main>

      <footer className="max-w-3xl mx-auto px-4 pb-10 pt-2 space-y-2">
        <SocialLinks />
        <p className="text-[11px] text-center" style={{ color: C.muted }}>
          Felpus · Buscador de mascotas perdidas y encontradas en {n} ·{" "}
          <Link href="/privacidad" className="underline underline-offset-2">Privacidad</Link> ·{" "}
          <Link href="/terminos" className="underline underline-offset-2">Términos</Link>
        </p>
      </footer>
    </div>
  );
}
