import Link from "next/link";
import LegalPage, { LegalSection } from "../../components/felpus/LegalPage";
import { SITE_URL } from "../../lib/site";

// "Sobre Felpus" (2026-10-29): qué es, por qué existe, cómo funciona y cómo
// se usan los datos, en lenguaje simple. Enlazada discretamente desde el pie
// de Inicio, junto a Privacidad y Términos.
//
// Solo afirmaciones verificables: sin avales, menciones en medios ni
// estadísticas que no se puedan comprobar. La declaración de interés de la
// Cámara de Diputados de Salta la confirmó el responsable del proyecto
// (2026-10-29); si se consigue el número de resolución o un link oficial,
// conviene sumarlo acá. Los reencuentros se muestran con los datos reales
// de la app (Inicio y Explorar), no con números fijos acá.

const TITLE = "Sobre Felpus";
const DESCRIPTION =
  "Felpus nació en Salta para ayudar a reunir mascotas perdidas con sus familias. Es gratis: publicá, buscá coincidencias y compartí avisos.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/sobre` },
  robots: { index: true, follow: true },
  openGraph: {
    title: `${TITLE} — Felpus`,
    description: DESCRIPTION,
    url: `${SITE_URL}/sobre`,
    siteName: "Felpus",
    locale: "es_AR",
    type: "website",
  },
};

const link = "underline underline-offset-2 font-semibold";

export default function SobrePage() {
  return (
    <LegalPage title="Sobre Felpus" updated="29 de octubre de 2026" otherHref="/privacidad" otherLabel="la Política de Privacidad">
      <LegalSection n={1} title="Qué es Felpus">
        <p>
          Felpus es una herramienta para publicar mascotas perdidas, encontradas o vistas sueltas, y encontrar posibles
          coincidencias entre esos avisos. Funciona desde el navegador del celular o la computadora: no hace falta
          instalar nada.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Por qué nació">
        <p>
          Felpus nació en Salta para ayudar a reunir mascotas con sus familias. Cuando se pierde un animal, los avisos se
          reparten entre grupos de Facebook, WhatsApp, refugios y veterinarias, y es difícil cruzarlos. Felpus no
          reemplaza esas herramientas: las complementa, juntando los avisos en un solo lugar y comparándolos entre sí.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Es gratis">
        <p>
          Publicar, buscar y contactar es gratis. Para publicar no necesitás crear una cuenta; si entrás con Google,
          además podés ver y administrar tus avisos y confirmar el reencuentro.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Cómo funcionan las coincidencias">
        <p>
          Cada aviso de una mascota perdida se compara con los de mascotas encontradas o vistas (y al revés), según la
          foto, el color, el tamaño, el sexo, la raza, las señas particulares, la zona y la fecha.
        </p>
        <p>
          El resultado es una <strong>posible</strong> coincidencia, no una confirmación: siempre conviene mirar las
          fotos con calma y hacer preguntas antes de dar algo por seguro.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Ubicación y datos personales">
        <p>
          En la ficha y en el mapa se muestra una zona aproximada, no el punto exacto que marcaste. El punto se usa para
          calcular coincidencias y alertas. Te recomendamos marcar dónde se perdió o se vio la mascota, no la puerta de
          tu casa.
        </p>
        <p>
          Tu WhatsApp o email no aparecen en el listado ni en el mapa: se muestran a quien abre tu aviso para
          contactarte, con un límite de consultas para evitar abusos, y se borran cuando confirmás el reencuentro.
        </p>
        <p>
          Más detalles en la{" "}
          <Link href="/privacidad" className={link}>
            Política de Privacidad
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection n={6} title="Quién está detrás">
        <p>
          Felpus es un proyecto independiente creado en Salta, Argentina. Lo hace crecer la comunidad que publica,
          comparte avisos y confirma reencuentros.
        </p>
        <p>
          Felpus fue declarado de interés por la Cámara de Diputados de la Provincia de Salta.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Reencuentros">
        <p>
          Los reencuentros que se ven en Felpus son los que confirmó quien publicó el aviso. Podés verlos en la{" "}
          <Link href="/" className={link}>
            página de inicio
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection n={8} title="Contacto">
        <p>
          Para consultas, sugerencias o para reportar un problema, escribinos a{" "}
          <a href="mailto:contacto.felpus@gmail.com" className={link}>
            contacto.felpus@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
