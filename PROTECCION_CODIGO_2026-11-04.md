# Protección contra copia y extracción — 2026-11-04

Una interfaz pública **no se puede proteger por completo**: todo lo que se
ejecuta en el navegador (HTML, CSS, JavaScript, imágenes) se puede descargar
y leer. Lo razonable es (1) que al navegador llegue solo lo necesario, (2)
que lo valioso corra en el servidor, (3) que la API no sirva gratis a
terceros y (4) dejar claro, legalmente, qué no se puede copiar.

Revisado sobre `origin/main` (`bacd244`). Rama: `proteccion-codigo`.

## 1. Qué se comprobó en producción (felpus.com)

| Qué | Resultado |
|---|---|
| Mapas de código (`*.js.map`) | No se publican: los 22 JS de la home no los referencian y pedirlos da 403 |
| JS minificado | Sí (build de producción de Next) |
| `.env`, `.git/config`, `package.json`, `next.config`, `vercel.json`, `supabase/schema.sql`, scripts, informes | 404 |
| Rutas de desarrollo (`/api/dev/test-push`) | Solo andan en desarrollo |
| `robots.txt` | Bloquea `/api/` para buscadores |
| Headers de seguridad | CSP estricta, `X-Frame-Options: DENY`, HSTS con preload, `nosniff` |
| `X-Powered-By: Next.js` | **Se mostraba** → sacado en esta rama |
| API usada desde otro sitio (navegador) | El preflight CORS responde sin `Access-Control-Allow-Origin` → el navegador la bloquea |
| Supabase con la clave pública | Sin acceso a datos personales ni a funciones de admin (revisión del mismo día) |
| Storage | No se puede listar el bucket |

## 2. Qué lógica llega al navegador

Revisé los JS generados (`.next/static`, 2,6 MB) buscando prompts, claves y reglas.

**No llegan al navegador:** los prompts del asistente (Claude) y de la
lectura de capturas (Gemini); las claves privadas (`service_role`,
Anthropic, Gemini, Resend, VAPID privada, secretos de webhooks); la consulta
de uso de Supabase; los cupos anti-abuso. Todo eso vive en `/api/*` o en la
base.

**Sí llegan, y por qué:**

| Qué | Riesgo real | Decisión |
|---|---|---|
| Email del admin escrito tal cual | Medio: blanco directo para phishing y para intentar entrar | **Arreglado**: el navegador solo conoce su huella SHA-256 (`src/lib/adminClient.js`) |
| Código del panel de admin y nombres de sus funciones | Bajo: verlo no da acceso (la base rechaza a todos menos al admin, comprobado) | Se queda; separarlo exige reorganizar `FelpusMatcher.jsx` (6.800 líneas) |
| **Algoritmo de coincidencias** (`scoreMatch`, `findMatches`, `matchBreakdown` en `src/lib/matching.js`: pesos, umbrales, combinación foto/color/atributos/zona) | Medio: es la lógica más propia de Felpus | **Pendiente, propuesto como trabajo aparte** (ver punto 5) |
| Procesamiento de fotos (achicar, marca de agua, histograma de color) | Bajo: son técnicas estándar y tienen que correr en el teléfono para no subir fotos pesadas | Se queda |
| Vectores de las fotos (`embedding`) legibles con la clave pública | Bajo: salen de un modelo público (DINOv2) aplicado a fotos que ya son públicas | Se queda mientras el cálculo de coincidencias corra en el navegador |
| Clave pública de Supabase, ID de Google Analytics, clave VAPID pública | Ninguno: son públicas por diseño y están cerradas con RLS | Se quedan |

## 3. Qué se cambió en esta rama

1. **`next.config.mjs`**: `poweredByHeader: false` (sin `X-Powered-By`) y
   `productionBrowserSourceMaps: false` escrito explícitamente, para que
   nadie active los mapas de código sin querer. Test: `src/lib/nextConfig.test.js`.
2. **Email del admin fuera del JS público**: `src/lib/adminClient.js` +
   `src/components/FelpusMatcher.jsx`. Antes el panel se mostraba si
   `user.email === "…@gmail.com"`; ahora compara huellas SHA-256. Solo
   decide si se **muestra** el panel; la barrera real sigue en la base y en
   `/api/admin/*`, que no cambiaron. Test: `src/lib/adminClient.test.js`.
3. **API: rechazo de pedidos de otros sitios** (`esPedidoDeOtroSitio` en
   `src/lib/httpGuards.js`). Se aplica en `chat`, `import-post`, `embed`,
   `photo-check`, `report-contact`, `create-report`, `flag-report`,
   `support-alias` y `support-flag`, antes de tocar la base o la IA.
   - Por qué: un clon que llamara a la API desde el navegador de **sus**
     visitantes repartiría el uso entre miles de IPs reales y esquivaría el
     cupo por IP. Hoy CORS ya lo impide, pero CORS no es una autorización:
     esto lo frena en el servidor aunque algún día se abra CORS.
   - Pasan: felpus.com, www.felpus.com, los previews de Vercel, localhost y
     los pedidos sin `Origin` (curl, servidores, la app de Android). A los
     scripts los frenan los cupos de la base (IP, cuenta, global diario) que
     se agregaron en el PR #117: en una API pública sin login no hay forma
     confiable de distinguir un script de un navegador.
4. **Términos y Condiciones**: sección nueva "11. Propiedad intelectual y
   uso automatizado" (marca, logo, ilustraciones, software y métodos de
   comparación; las fotos siguen siendo de quien las publica; prohibido
   extraer datos en masa o usar la API desde otros sitios; compartir links
   está permitido). Fecha de actualización: 4/11/2026. **Es un texto base:
   conviene que lo revise un abogado.**

No se tocó la base de datos, el diseño, el SEO ni los flujos de publicar,
mapas, fotos, login o modo invitado.

## 4. Pruebas

- `npm test`: 74 archivos, 1068 tests OK (nuevos: `nextConfig`,
  `adminClient`, `esPedidoDeOtroSitio`). `npm run lint` OK. `next build` OK.
- En el JS generado: el email del admin aparece 0 veces (antes, 1).
- Con `next start` local:
  - sin `X-Powered-By`;
  - POST con `Origin` de otro sitio → 403 en las 5 rutas probadas;
  - `Sec-Fetch-Site: cross-site` → 403;
  - desde el propio origen pasa el control (sin tocar la base);
  - la home carga los reportes y `/terminos` muestra la sección nueva.
- En producción solo hice lecturas y pedidos inválidos. Uno de ellos (un
  POST a `/api/embed` sin imagen) sumó 1 uso en `limites_uso` para mi IP.

## 5. Riesgos pendientes (no resueltos acá)

1. **Algoritmo de coincidencias en el navegador — RESUELTO en la rama
   `coincidencias-servidor`.** El puntaje (`src/lib/matchingScore.js`) corre
   solo en el servidor (`/api/coincidencias`, `/api/admin/impacto`);
   `matchingScore.test.js` frena el CI si algún componente lo importa. Con
   datos reales, 20 avisos dieron los mismos resultados que el cálculo del
   navegador. De paso apareció un error de producción: al buscar
   coincidencias desde una tarjeta, la foto del aviso consultado no contaba
   (se comparaba la versión sin vectores), y los puntajes salían más bajos
   (ej. 32% en vez de 40%). Con el cálculo en el servidor queda corregido.
2. **Subida de fotos sin login y sin límite (medio).** Pendiente desde la
   revisión anterior (M2): URLs de subida firmadas desde el servidor.
3. **El listado público se puede descargar entero (bajo, por diseño).**
   Explorar y el mapa necesitan los avisos públicos; cualquiera puede bajar
   esos mismos datos con la clave pública. Sin teléfonos, emails ni
   ubicaciones exactas.
4. **Marca (bajo).** Logo e ilustraciones (`public/assets`) tienen que ser
   públicos para mostrarse y para compartir. Lo que corresponde: la sección
   de términos de arriba y, si se quiere ir más allá, registrar la marca
   "Felpus" (INPI, en Argentina). No recomiendo bloquear el hotlinking ni
   ponerle marca de agua al logo: perjudica compartir y el SEO. Las fotos
   de los avisos ya llevan marca de agua al subirse.
5. **Ofuscación del JS: no recomendada.** El build ya está minificado; un
   ofuscador agrega peso y lentitud y se revierte con herramientas
   gratuitas. Lo valioso hay que moverlo al servidor (punto 1), no
   esconderlo.
6. **Clic derecho y herramientas de desarrollo:** no se bloquearon, como se
   pidió.
