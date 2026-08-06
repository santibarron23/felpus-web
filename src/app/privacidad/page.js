import LegalPage, { LegalSection } from "../../components/felpus/LegalPage";
import { SITE_URL } from "../../lib/site";

const TITLE = "Política de Privacidad";
const DESCRIPTION =
  "Qué información recopila Felpus, cómo la utiliza y qué opciones tenés sobre tus datos al publicar o buscar mascotas perdidas y encontradas.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/privacidad` },
  robots: { index: true, follow: true },
  openGraph: {
    title: `${TITLE} — Felpus`,
    description: DESCRIPTION,
    url: `${SITE_URL}/privacidad`,
    siteName: "Felpus",
    locale: "es_AR",
    type: "website",
  },
};

export default function PrivacidadPage() {
  return (
    <LegalPage
      title="Política de Privacidad de Felpus"
      updated="6 de agosto de 2026"
      otherHref="/terminos"
      otherLabel="los Términos y Condiciones"
    >
      <LegalSection n={1} title="Introducción">
        <p>
          Felpus es una plataforma digital destinada a facilitar la publicación, búsqueda y posible identificación de
          mascotas perdidas y encontradas.
        </p>
        <p>
          Esta Política de Privacidad explica qué información puede recopilar Felpus, cómo puede utilizarla y qué
          opciones tienen los usuarios respecto de sus datos.
        </p>
        <p>Al utilizar Felpus, el usuario reconoce haber leído esta Política de Privacidad.</p>
      </LegalSection>

      <LegalSection n={2} title="Información que podemos recopilar">
        <p>
          Felpus puede recopilar información proporcionada directamente por el usuario, incluyendo nombre, dirección
          de correo electrónico, número de teléfono o WhatsApp, fotografías, descripciones de mascotas y demás
          información incluida voluntariamente en publicaciones o formularios.
        </p>
        <p>
          Cuando el usuario utiliza el inicio de sesión mediante Google u otros proveedores externos, Felpus puede
          recibir información básica de la cuenta autorizada por el usuario, como nombre, correo electrónico,
          identificador de cuenta y fotografía de perfil.
        </p>
        <p>
          Felpus también puede recopilar información técnica relacionada con el uso del servicio, como dirección IP,
          tipo de dispositivo, navegador, registros de actividad y datos similares necesarios para operar, proteger y
          mejorar la plataforma.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Información de ubicación">
        <p>
          Felpus puede solicitar o permitir que el usuario indique la ubicación donde una mascota fue perdida,
          encontrada o vista.
        </p>
        <p>
          Esta información puede utilizarse para mostrar publicaciones relevantes, calcular proximidad y generar
          posibles coincidencias.
        </p>
        <p>
          El usuario debe evitar publicar domicilios particulares u otra información cuya divulgación pueda
          comprometer su seguridad o la de terceros.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Finalidades del tratamiento">
        <p>
          La información podrá utilizarse para operar Felpus, autenticar usuarios, publicar mascotas perdidas o
          encontradas, generar posibles coincidencias, facilitar el contacto entre usuarios, prevenir abusos, mejorar
          la plataforma, realizar análisis estadísticos y enviar comunicaciones relacionadas con el servicio.
        </p>
        <p>
          Felpus podrá utilizar tecnologías automatizadas, algoritmos y sistemas de inteligencia artificial para
          analizar fotografías, características, ubicación, fechas y otros datos con el objetivo de identificar
          posibles coincidencias.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Información pública">
        <p>Determinada información proporcionada al crear una publicación puede hacerse públicamente accesible.</p>
        <p>
          Esto puede incluir fotografías de la mascota, nombre, características físicas, zona aproximada, fecha de
          pérdida o hallazgo y la información de contacto que el propio usuario decida compartir.
        </p>
        <p>El usuario es responsable de la información que decide publicar.</p>
      </LegalSection>

      <LegalSection n={6} title="Proveedores externos">
        <p>
          Felpus puede utilizar proveedores tecnológicos externos para funciones como alojamiento, base de datos,
          autenticación, almacenamiento, mapas, analítica, correo electrónico, seguridad y procesamiento
          automatizado.
        </p>
        <p>
          Estos proveedores podrán procesar determinados datos únicamente en la medida necesaria para prestar sus
          respectivos servicios.
        </p>
        <p>El inicio de sesión mediante Google está además sujeto a las políticas y condiciones aplicables de Google.</p>
      </LegalSection>

      <LegalSection n={7} title="Conservación">
        <p>
          Felpus podrá conservar información durante el tiempo razonablemente necesario para prestar el servicio,
          mantener registros, prevenir fraude o abuso, cumplir obligaciones legales y resolver controversias.
        </p>
        <p>
          Los datos podrán ser eliminados o anonimizados cuando dejen de ser necesarios, sujeto a las obligaciones
          legales aplicables.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Seguridad">
        <p>Felpus adopta medidas técnicas y organizativas razonables destinadas a proteger la información.</p>
        <p>
          Sin embargo, ningún sistema conectado a Internet puede garantizar seguridad absoluta. Por lo tanto, Felpus
          no garantiza que sus sistemas sean completamente inmunes a accesos no autorizados, errores,
          vulnerabilidades, interrupciones o incidentes de seguridad.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Responsabilidad del usuario">
        <p>Cada usuario es responsable de la información que proporciona y publica.</p>
        <p>
          Felpus recomienda no publicar información sensible o innecesaria y adoptar precauciones antes de contactar,
          encontrarse o intercambiar información con terceros.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Menores de edad">
        <p>
          Felpus no está dirigido específicamente a menores que no tengan capacidad legal suficiente para consentir
          el tratamiento de sus datos conforme a la legislación aplicable.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Derechos sobre los datos personales">
        <p>
          Los usuarios podrán solicitar, cuando corresponda conforme a la legislación aplicable, acceso,
          rectificación, actualización o eliminación de sus datos personales.
        </p>
        <p>Las solicitudes podrán realizarse mediante los canales de contacto publicados por Felpus.</p>
      </LegalSection>

      <LegalSection n={12} title="Modificaciones">
        <p>
          Felpus podrá actualizar esta Política de Privacidad cuando resulte necesario debido a cambios tecnológicos,
          funcionales, regulatorios o comerciales.
        </p>
        <p>La versión vigente estará disponible permanentemente en el sitio web.</p>
      </LegalSection>

      <LegalSection n={13} title="Contacto">
        <p>Las consultas relacionadas con privacidad podrán enviarse al correo electrónico de contacto indicado en Felpus.</p>
      </LegalSection>
    </LegalPage>
  );
}
