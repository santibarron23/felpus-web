# Felpus — Buscador inteligente de mascotas perdidas y encontradas

App web (Next.js) que permite reportar mascotas perdidas o encontradas con foto
y descripción, y busca coincidencias automáticamente combinando:

1. **Similitud de imagen** — histograma de color (64 bins), calculado en el navegador.
2. **Similitud de texto** — superposición de palabras (Jaccard) sobre color/tamaño/descripción.
3. **Proximidad geográfica** — distancia real (haversine) o coincidencia de zona.

Incluye gamificación: puntos por reportar y por confirmar reencuentros reales,
con un ranking de contribuyentes ("Salón de la fama").

Los datos se guardan en **Supabase** (Postgres + Storage), así que persisten
de verdad y son visibles para cualquiera que entre al sitio.

---

## 0. Qué vas a necesitar

- [Node.js](https://nodejs.org) 18 o superior instalado en tu computadora.
- Una cuenta gratis en [supabase.com](https://supabase.com).
- Una cuenta gratis en [github.com](https://github.com) y en [vercel.com](https://vercel.com) (para el paso de deploy).

No hace falta pagar nada para tener esto funcionando con tráfico moderado.

---

## 1. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) → **New project**.
2. Elegí un nombre (ej. `felpus`) y una contraseña de base de datos (guardala, no la vas a necesitar para esta app pero es buena práctica).
3. Esperá a que el proyecto termine de crearse (1-2 minutos).
4. En el menú lateral, andá a **SQL Editor** → **New query**.
5. Abrí el archivo `supabase/schema.sql` de este proyecto, copiá **todo** su contenido, pegalo en el editor y tocá **Run**.
   - Esto crea las tablas `reports` y `contributors`, las políticas de acceso, y el bucket de Storage `felpus-photos` para las fotos.
6. Andá a **Project Settings → API**. Vas a necesitar dos datos de ahí:
   - **Project URL** (algo como `https://xxxxx.supabase.co`)
   - **anon public key** (una clave larga)

---

## 2. Configurar el proyecto localmente

1. Descomprimí este proyecto y abrí una terminal en la carpeta `felpus-web`.
2. Instalá las dependencias:
   ```bash
   npm install
   ```
3. Copiá el archivo de variables de entorno:
   ```bash
   cp .env.local.example .env.local
   ```
4. Abrí `.env.local` y completá con los datos del paso 1:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anonima-larga
   ```
5. Corré el proyecto en modo desarrollo:
   ```bash
   npm run dev
   ```
6. Abrí [http://localhost:3000](http://localhost:3000) — ya debería funcionar completo: reportar, ver coincidencias, ranking, etc. La primera vez que cargue va a crear automáticamente 5 reportes de ejemplo (`seedIfEmpty`) para que no arranque vacío.

---

## 2.1 Activar "Iniciar sesión con Google" (necesario para sumar puntos)

Cualquiera puede reportar mascotas perdidas/encontradas como invitado
escribiendo solo un apodo — eso nunca requiere login. Pero **sumar puntos y
confirmar reencuentros sí requiere haber iniciado sesión con Google**: es lo
que evita que cualquiera se autoasigne puntos escribiendo un apodo de texto
libre y resolviendo el reporte de otra persona. Para activarlo:

1. En **Google Cloud Console** → [console.cloud.google.com](https://console.cloud.google.com):
   - Creá un proyecto (o usá uno existente).
   - Andá a **APIs & Services → OAuth consent screen** y completalo (tipo "External" alcanza).
   - Andá a **APIs & Services → Credentials → Create Credentials → OAuth client ID**, tipo **Web application**.
   - En **Authorized redirect URIs** agregá la URL que te da Supabase en el paso siguiente.
2. En tu proyecto de **Supabase** → **Authentication → Providers → Google**:
   - Activalo y pegá el **Client ID** y **Client Secret** que te dio Google.
   - Supabase te muestra ahí mismo la **Redirect URL** (algo como `https://xxxxx.supabase.co/auth/v1/callback`) — esa es la que copiás en el paso anterior en Google Cloud.
3. En **Authentication → URL Configuration**, agregá `http://localhost:3000` en **Redirect URLs** (para probar local) y tu dominio de producción cuando lo tengas.
4. Volvé a correr `supabase/schema.sql` completo en el SQL Editor (es
   idempotente) — agrega las columnas y políticas nuevas que exigen sesión
   iniciada para sumar puntos y confirmar reencuentros.

Con esto, el botón "Iniciar sesión con Google" de la app ya funciona. Si no
configurás nada de esto, ese botón no va a completar el login — la gente puede
seguir reportando como invitado, pero nadie va a poder sumar puntos ni
confirmar reencuentros hasta que esto esté activo.

### 2.1.1 Que el login no muestre el dominio de Supabase (opcional)

Con la configuración de arriba nada más, cuando alguien toca "Acceder con
Google" el navegador rebota por el dominio propio de tu proyecto de Supabase
antes de volver — la pantalla "Elige una cuenta" de Google le muestra de paso
ese dominio (`xxxx.supabase.co`), no el tuyo. Es un detalle cosmético (el
login funciona igual), pero puede llamar la atención o complicar la
verificación de marca de Google OAuth si en algún momento la pedís. Para
evitarlo, sin pagar nada:

1. Copiá el mismo **Client ID** que ya usaste en el paso 2.1 (Google Cloud
   Console → *Credentials* → tu OAuth Client → campo "Client ID", termina en
   `.apps.googleusercontent.com`). No es el Client Secret, y no hace falta
   crear uno nuevo.
2. Agregalo como `NEXT_PUBLIC_GOOGLE_CLIENT_ID` en tu `.env.local` (y en las
   variables de entorno de tu hosting en producción).
3. En **Supabase Dashboard → Authentication → Providers → Google**, buscá el
   campo **"Authorized Client IDs"** y agregá ahí el mismo Client ID.
4. Redesplegá.

Sin este paso, todo sigue funcionando exactamente igual que antes (es
100% opcional) — el botón usa el flujo con redirect de siempre.

---

## 2.2 Reconocimiento visual con IA (no requiere configuración)

Cada foto que se sube pasa por `/api/embed`, que calcula en el propio
servidor (función de Vercel) un embedding visual con **DINOv2 small**
(transformers.js + ONNX Runtime, ver `src/lib/imageEmbedding.js`). No usa
ninguna API externa ni token: el modelo (24 MB, público) se baja del Hub de
Hugging Face la primera vez que arranca la función. Debajo del recuadro de
foto se ve "Análisis visual con IA activado".

Si `/api/embed` falla por cualquier motivo, la app sigue comparando por
color (histograma) — no se rompe nada, solo es menos preciso.

**Cosas a tener en cuenta:**
- La primera foto después de un rato sin uso tarda unos segundos (arranque
  en frío: bajar y cargar el modelo). Después, ~0,5-1 s por foto.
- Todos los embeddings tienen que salir del mismo modelo y revisión (fijados
  en `imageEmbedding.js`). Si se cambia de modelo, los embeddings guardados
  dejan de ser comparables con los nuevos.
- Los reportes de ejemplo (los 5 que se cargan solos) no usan IA, así que la
  comparación con ellos siempre cae al color. Es esperable.

---

## 2.3 Mapas (no hay que configurar nada)

Los mapas usan **OpenStreetMap + Leaflet** (desde 2026-10-26; antes eran de
Google Maps): no necesitan key, cuenta ni facturación. Las búsquedas de
direcciones salen de **Photon** (sugerencias mientras se escribe la zona) y
**Nominatim** (punto ↔ barrio). Todo está en `src/lib/osmMap.js`.

Las políticas de uso de OpenStreetMap y Nominatim piden atribución visible
(ya está en cada mapa) y un uso moderado. Si algún día el tráfico crece
mucho, se puede cambiar `TILE_URL` en `osmMap.js` por un proveedor de
teselas propio o pago sin tocar el resto.

---

## 3. Subir a GitHub

```bash
cd felpus-web
git init
git add .
git commit -m "Felpus MVP"
```

Creá un repositorio nuevo y vacío en GitHub (sin README, sin .gitignore — ya los tenés), y luego:

```bash
git remote add origin https://github.com/TU-USUARIO/felpus-web.git
git branch -M main
git push -u origin main
```

> El archivo `.gitignore` ya excluye `node_modules` y `.env.local`, así que tus credenciales de Supabase **no** se suben al repo.

---

## 4. Desplegar en Vercel (gratis)

1. Entrá a [vercel.com](https://vercel.com) → **Add New → Project**.
2. Elegí el repositorio `felpus-web` que acabás de subir.
3. Vercel detecta automáticamente que es Next.js — no hace falta tocar nada de la configuración de build.
4. Antes de darle a "Deploy", abrí la sección **Environment Variables** y agregá las mismas dos que pusiste en `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Tocá **Deploy**. En 1-2 minutos vas a tener una URL pública tipo `felpus-web.vercel.app`.

Cada vez que hagas `git push` a `main`, Vercel vuelve a desplegar solo.

### Dominio propio (opcional)

En el proyecto de Vercel → **Settings → Domains**, podés agregar un dominio que hayas comprado (ej. `felpus.app`) y seguir las instrucciones de DNS que te muestra.

---

## 5. Estructura del proyecto

```
felpus-web/
  public/assets/           ← logo, íconos e ilustración de marca (PNG estáticos)
  src/
    app/
      layout.js            ← layout raíz + metadata
      page.js               ← renderiza el componente principal
      globals.css           ← Tailwind + fuentes + animaciones
      api/embed/route.js    ← ruta de servidor: calcula el embedding de IA (DINOv2)
    components/
      FelpusMatcher.jsx     ← toda la UI y lógica de interacción
      MapPicker.jsx          ← mapa de Google con pin arrastrable/tocable
    lib/
      matching.js           ← funciones puras: histograma, embeddings, Jaccard, haversine, scoring
      store.js               ← capa de datos: lee/escribe en Supabase
      supabaseClient.js       ← inicialización del cliente de Supabase
  supabase/
    schema.sql              ← tablas, políticas y bucket de Storage
```

La separación es intencional: `matching.js` no depende de React ni de Supabase
(son funciones puras que también podrías testear o reusar en otro backend),
y `store.js` es la única parte que sabe cómo hablar con Supabase — si el día
de mañana cambiás de proveedor, sólo tocás ese archivo.

---

## 6. Limitaciones conocidas del MVP (léelo antes de lanzar en serio)

- **Resuelto:** el ranking ya no se guarda por apodo de texto, sino por el
  `user.id` estable de Supabase Auth — dos personas con el mismo apodo no
  comparten contador, y solo cuentas logueadas con Google aparecen en el
  ranking. Sumar puntos y confirmar reencuentros ahora **requieren sesión
  iniciada**; reportar mascotas se mantiene abierto a invitados. Ver
  `handleSubmit` y `markResolvedAndReward` en `FelpusMatcher.jsx`.
- **Políticas de base de datos.** `schema.sql` ahora exige `auth.uid() is not
  null` (sesión de Supabase Auth) para escribir en `contributors` y para
  actualizar `reports` (resolver un reencuentro). Crear reportes nuevos sigue
  abierto a cualquiera con la `anon key`, a propósito, para no perder alcance
  con vecinos que reportan sin loguearse.
- **Matching por IA visual, con color de respaldo.** Cada foto nueva lleva un
  embedding de DINOv2 calculado en el servidor (sección 2.2). Los reportes
  anteriores a 2026-10 no lo tienen y se comparan por histograma de color.
- **Sin rate limiting.** Nada impide que alguien publique reportes en bucle.
  Para producción conviene agregar límites (por IP o por usuario autenticado).

---

## 7. Costos esperados

Felpus depende de 4 servicios con algún componente pago: Vercel (hosting,
incluido el cálculo de embeddings de imagen para el matching por IA),
Supabase (base de datos + storage + auth) y Resend (email de "posible
coincidencia"). Los mapas son de OpenStreetMap (gratis, sin key: ver 2.3).
El dominio (felpus.com) es aparte y se paga anual, no mensual.

Antes, el que más pesaba a escala era Google Maps Platform (precio por
llamada y sin tope automático); desde 2026-10-26 los mapas son de
OpenStreetMap y ese costo desapareció. Los servicios que quedan tienen un
tier gratuito real que aguanta bastante antes de cobrar nada.

| Servicio | Qué paga | Tier gratis | Primer escalón pago |
|---|---|---|---|
| Vercel | Hosting del sitio | 100GB banda ancha, 1M invocaciones/mes (uso NO comercial) | Pro: $20/mes por asiento |
| Supabase | DB + Storage de fotos + Auth | 500MB DB, 1GB storage, 5GB egreso, 50k usuarios activos/mes | Pro: $25/mes + excedentes |
| OpenStreetMap / Photon / Nominatim | Mapa, sugerencias de zona, barrio a partir del GPS o del pin | Gratis, sin key (uso moderado, con atribución) | — |
| (IA visual) | Embedding DINOv2 de cada foto subida: corre dentro de la función de Vercel, sin servicio aparte | Entra en el cómputo de Vercel (~1 s por foto) | — |
| Resend | Email de "posible coincidencia" | 3.000 emails/mes (100/día) | Pro: $20/mes → 50.000 emails |

### Estimado por volumen

Supuestos usados (ajustables, pero razonables dado cómo está construido el
producto): 2 fotos promedio por reporte, la mitad de los reportes usa el
botón "Ubicación" (geocodificación), casi todos usan el autocompletado de
zona, y ~60% de los reportes nuevos generan al menos un email de
coincidencia. El mapa de "Explorar" (`ReportsMap`) se carga automáticamente
en **cada visita desde desktop** (no solo al tocar "Ver mapa" como en
mobile) — ver nota al final, es el mayor "leak" de costo evitable.

| | Piloto (1 ciudad, arrancando) | Adopción real (1 ciudad activa) | Multi-ciudad / escala |
|---|---|---|---|
| Reportes nuevos/mes | ~50 | ~400 | ~3.000 |
| Visitas/mes | ~2.000 | ~20.000 | ~150.000 |
| **Vercel** | $0 (Hobby) | $0–20 | $20+ |
| **Supabase** | $0 (Free) | ~$25 (Pro, storage de fotos ya no entra en el tier gratis) | ~$25–50 |
| **Resend** | $0 | $0 | $0–20 |
| **Total aprox./mes** | **$0–5** | **$25–45** | **$45–90** |

*(Estimado en dólares, con precios públicos vigentes de cada proveedor al
2026 — no una cotización real.)*

### Cómo controlar el costo si el uso crece

1. ✅ **Resuelto**: los mapas ya no dependen de Google Maps (el único
   servicio sin techo automático de costo): son de OpenStreetMap, gratis.
2. ✅ **Resuelto**: el mapa de "Explorar" en desktop se cargaba de nuevo
   —y facturaba una carga nueva de Google Maps— cada vez que alguien salía
   de esa pestaña y volvía a entrar, aunque fuera la misma visita. Ahora la
   sección se queda montada (oculta con CSS, no destruida) después de la
   primera vez, así que como máximo factura 1 carga por sesión en vez de una
   por cada ida y vuelta (ver `exploreVisited` en `FelpusMatcher.jsx`).
3. Si el volumen de fotos crece rápido, revisar el tamaño de Storage en
   Supabase — cada foto ya se comprime a máx. 1000px/calidad 0.85 antes de
   subir, así que el costo por foto es bajo, pero es lo que más rápido llena
   el tier gratuito.
