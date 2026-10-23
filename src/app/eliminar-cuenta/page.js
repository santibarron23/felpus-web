import LegalPage, { LegalSection } from "../../components/felpus/LegalPage";
import { SITE_URL } from "../../lib/site";

// Google Play exige que toda app que permite crear cuenta tenga un enlace
// web donde pedir la eliminación de la cuenta y sus datos (se carga en
// Play Console → Seguridad de los datos), y que se pueda llegar desde la
// app — por eso también está en el footer del home.
const TITLE = "Eliminar tu cuenta";
const DESCRIPTION = "Cómo pedir que se elimine tu cuenta de Felpus y los datos asociados.";
const MAILTO =
  "mailto:contacto.felpus@gmail.com?subject=" +
  encodeURIComponent("Eliminar mi cuenta de Felpus") +
  "&body=" +
  encodeURIComponent("Hola, quiero que eliminen mi cuenta de Felpus y mis datos. Mi email de la cuenta es: ");

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/eliminar-cuenta` },
  robots: { index: true, follow: true },
  openGraph: {
    title: `${TITLE} — Felpus`,
    description: DESCRIPTION,
    url: `${SITE_URL}/eliminar-cuenta`,
    siteName: "Felpus",
    locale: "es_AR",
    type: "website",
  },
};

export default function EliminarCuentaPage() {
  return (
    <LegalPage
      title="Eliminar tu cuenta de Felpus"
      updated="23 de octubre de 2026"
      otherHref="/privacidad"
      otherLabel="la Política de Privacidad"
    >
      <LegalSection n={1} title="Cómo pedirlo">
        <p>
          Mandanos un correo a{" "}
          <a href={MAILTO} className="underline underline-offset-2 font-semibold">
            contacto.felpus@gmail.com
          </a>{" "}
          con el asunto <strong>“Eliminar mi cuenta de Felpus”</strong>, desde el mismo email con el que iniciás sesión
          en Felpus (así podemos confirmar que la cuenta es tuya).
        </p>
        <p>Te respondemos para confirmar y eliminamos la cuenta dentro de los 30 días siguientes al pedido.</p>
      </LegalSection>

      <LegalSection n={2} title="Qué se elimina">
        <ul className="list-disc pl-5 space-y-1">
          <li>Tu cuenta y los datos de perfil (nombre, email, foto de perfil, teléfono o WhatsApp).</li>
          <li>Todas tus publicaciones de mascotas perdidas o encontradas, con sus fotos.</li>
          <li>Tus alertas de zona y las suscripciones a notificaciones.</li>
        </ul>
      </LegalSection>

      <LegalSection n={3} title="Qué se puede conservar">
        <p>
          Podemos conservar por un tiempo limitado registros técnicos y de seguridad (por ejemplo, denuncias de
          publicaciones o registros de errores) y copias de respaldo, que se borran automáticamente en un plazo máximo
          de 90 días, salvo que la ley nos obligue a guardarlos por más tiempo.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Si solo querés borrar una publicación">
        <p>
          No hace falta eliminar la cuenta: iniciá sesión en Felpus, abrí tu publicación y tocá <strong>Eliminar</strong>.
          Se borran la publicación y sus fotos al instante.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
