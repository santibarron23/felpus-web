import LegalPage, { LegalSection } from "../../components/felpus/LegalPage";
import { SITE_URL } from "../../lib/site";

const TITLE = "Términos y Condiciones de Uso";
const DESCRIPTION =
  "Condiciones de uso de Felpus: naturaleza del servicio, coincidencias automatizadas, contacto entre usuarios, límites de responsabilidad y más.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/terminos` },
  robots: { index: true, follow: true },
  openGraph: {
    title: `${TITLE} — Felpus`,
    description: DESCRIPTION,
    url: `${SITE_URL}/terminos`,
    siteName: "Felpus",
    locale: "es_AR",
    type: "website",
  },
};

export default function TerminosPage() {
  return (
    <LegalPage
      title="Términos y Condiciones de Uso de Felpus"
      updated="6 de agosto de 2026"
      otherHref="/privacidad"
      otherLabel="la Política de Privacidad"
    >
      <LegalSection n={1} title="Naturaleza del servicio">
        <p>
          Felpus es una herramienta tecnológica destinada a facilitar la publicación y búsqueda de información
          relacionada con mascotas perdidas y encontradas.
        </p>
        <p>Felpus funciona exclusivamente como plataforma intermediaria de información.</p>
        <p>
          Felpus no es una organización de rescate, refugio, servicio veterinario, autoridad pública, servicio de
          emergencia ni garantiza la recuperación de ninguna mascota.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Sin garantía de resultados">
        <p>
          Felpus no garantiza que una mascota perdida sea encontrada, que una mascota encontrada pueda ser
          identificada correctamente ni que exista una coincidencia dentro de la plataforma.
        </p>
        <p>
          Los resultados dependen, entre otros factores, de la información proporcionada por los usuarios, calidad
          de las fotografías, ubicación, tiempo transcurrido, cantidad de publicaciones disponibles y funcionamiento
          de tecnologías automatizadas.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Coincidencias automatizadas e inteligencia artificial">
        <p>
          Felpus puede utilizar algoritmos, inteligencia artificial, reconocimiento visual, análisis geográfico u
          otros sistemas automatizados para sugerir posibles coincidencias.
        </p>
        <p>Toda coincidencia constituye únicamente una sugerencia.</p>
        <p>Felpus no garantiza la exactitud, identidad, autenticidad ni fiabilidad de ninguna coincidencia.</p>
        <p>Pueden producirse falsos positivos, falsos negativos, errores de clasificación y resultados incorrectos.</p>
        <p>El usuario deberá verificar independientemente cualquier coincidencia antes de adoptar decisiones basadas en ella.</p>
      </LegalSection>

      <LegalSection n={4} title="Contenido generado por usuarios">
        <p>Felpus permite que terceros publiquen información, imágenes y datos.</p>
        <p>Felpus no garantiza que dicho contenido sea verdadero, completo, actualizado, legítimo o exacto.</p>
        <p>La responsabilidad por el contenido publicado corresponde al usuario que lo proporciona.</p>
        <p>
          Felpus podrá moderar, ocultar o eliminar contenido cuando lo considere necesario, sin que ello implique una
          obligación general de supervisión permanente.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Contacto entre usuarios">
        <p>Felpus puede facilitar mecanismos para que los usuarios se contacten entre sí.</p>
        <p>
          Felpus no participa ni es parte de las comunicaciones, encuentros, acuerdos o transacciones posteriores
          entre usuarios.
        </p>
        <p>Cada usuario es responsable de evaluar la identidad y legitimidad de las personas con las que interactúa.</p>
        <p>
          Se recomienda extremar precauciones antes de proporcionar información personal, entregar dinero,
          trasladarse a una ubicación o encontrarse personalmente con terceros.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Fraudes y solicitudes de dinero">
        <p>Felpus no garantiza la identidad ni las intenciones de los usuarios.</p>
        <p>
          Los usuarios deben desconfiar de solicitudes de dinero, recompensas anticipadas, transferencias, códigos de
          verificación o cualquier comportamiento sospechoso.
        </p>
        <p>
          Felpus no será responsable por fraudes, estafas, engaños, suplantaciones de identidad o pérdidas
          económicas derivadas de interacciones entre usuarios, en la máxima medida permitida por la legislación
          aplicable.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Propiedad y custodia de animales">
        <p>
          La aparición de una mascota en Felpus no constituye prueba de propiedad, posesión legítima ni derecho
          alguno sobre el animal.
        </p>
        <p>
          Felpus no determina quién es propietario de una mascota ni resuelve disputas relacionadas con propiedad,
          tenencia o custodia.
        </p>
        <p>Los usuarios son responsables de realizar las verificaciones pertinentes.</p>
      </LegalSection>

      <LegalSection n={8} title="Información veterinaria">
        <p>Felpus no proporciona diagnóstico, tratamiento ni asesoramiento veterinario.</p>
        <p>
          Ante una mascota herida, enferma o en situación de riesgo, deberá recurrirse a profesionales veterinarios o
          autoridades competentes.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Disponibilidad">
        <p>Felpus podrá modificar, suspender o discontinuar total o parcialmente cualquier función del servicio.</p>
        <p>
          No se garantiza disponibilidad permanente, ausencia de errores, conservación indefinida de publicaciones ni
          funcionamiento ininterrumpido.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Uso prohibido">
        <p>
          No podrá utilizarse Felpus para publicar información falsa deliberadamente, acosar o amenazar personas,
          cometer fraudes, suplantar identidades, distribuir contenido ilícito, vulnerar derechos de terceros,
          intentar acceder sin autorización a sistemas o utilizar la plataforma con finalidades contrarias a la ley.
        </p>
        <p>
          Felpus podrá suspender o eliminar cuentas y publicaciones cuando detecte o sospeche razonablemente estas
          conductas.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Servicios de terceros">
        <p>Felpus depende parcialmente de servicios proporcionados por terceros.</p>
        <p>
          Felpus no controla ni garantiza la disponibilidad, seguridad o funcionamiento permanente de dichos
          servicios externos y no será responsable por interrupciones o fallos atribuibles a ellos, en la máxima
          medida permitida por ley.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Aportes y contribuciones">
        <p>
          Felpus podrá permitir aportes económicos voluntarios destinados a colaborar con el mantenimiento o
          desarrollo de la plataforma.
        </p>
        <p>
          Salvo que se indique expresamente lo contrario, dichos aportes no constituyen la compra de un producto, no
          garantizan funcionalidades adicionales ni aumentan las probabilidades de encontrar una mascota.
        </p>
        <p>Las condiciones y disponibilidad de los medios de pago utilizados también estarán sujetas a las reglas del correspondiente proveedor.</p>
      </LegalSection>

      <LegalSection n={13} title="Limitación de responsabilidad">
        <p>
          En la máxima medida permitida por la legislación aplicable, Felpus, sus titulares, desarrolladores,
          colaboradores y proveedores no serán responsables por daños directos o indirectos, pérdida de información,
          pérdida económica, daño moral, pérdida o lesión de animales, oportunidades perdidas, decisiones tomadas
          sobre la base de información publicada, errores en coincidencias automatizadas, actos u omisiones de
          usuarios o terceros, encuentros entre usuarios, fraudes, contenido incorrecto, interrupciones del servicio
          o cualquier consecuencia derivada del uso o imposibilidad de uso de la plataforma.
        </p>
        <p>
          Felpus se proporciona &ldquo;tal como está&rdquo; y según disponibilidad, sin garantías expresas o
          implícitas respecto de exactitud, disponibilidad, idoneidad para un propósito determinado o resultados.
        </p>
        <p>
          Nada de estos Términos pretende excluir o limitar derechos o responsabilidades que no puedan ser
          válidamente excluidos o limitados conforme a la legislación aplicable.
        </p>
      </LegalSection>

      <LegalSection n={14} title="Indemnidad">
        <p>
          En la medida permitida por la legislación aplicable, el usuario se compromete a mantener indemne a Felpus
          frente a reclamaciones de terceros derivadas del contenido que publique, del uso indebido de la
          plataforma, de la vulneración de derechos de terceros o del incumplimiento de estos Términos.
        </p>
      </LegalSection>

      <LegalSection n={15} title="Modificaciones">
        <p>Felpus podrá modificar estos Términos para adaptarlos a cambios legales, técnicos o funcionales.</p>
        <p>La versión vigente será la publicada en el sitio web.</p>
      </LegalSection>

      <LegalSection n={16} title="Legislación aplicable">
        <p>
          Estos Términos se interpretarán conforme a la legislación que resulte aplicable, sin perjuicio de las
          normas imperativas de protección de consumidores, usuarios y datos personales que correspondan.
        </p>
      </LegalSection>

      <LegalSection n={17} title="Contacto">
        <p>
          Para consultas relacionadas con estos Términos y Condiciones, reportes sobre el funcionamiento de la
          plataforma o cualquier otra comunicación relacionada con Felpus, los usuarios podrán comunicarse a través
          de:
        </p>
        <p>
          Correo electrónico:{" "}
          <a href="mailto:contacto.felpus@gmail.com" className="underline underline-offset-2 font-semibold">
            contacto.felpus@gmail.com
          </a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
