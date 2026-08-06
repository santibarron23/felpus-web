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

## 2.2 Activar reconocimiento visual real con IA (opcional)

Por defecto, la app compara fotos por color dominante (gratis, sin configuración extra).
Para que compare de verdad forma, raza aparente y patrón visual (no solo
color), se puede conectar un modelo de visión (CLIP) gratis vía Hugging Face:

1. Creá una cuenta gratis en [huggingface.co](https://huggingface.co).
2. Andá a tu perfil → **Settings → Access Tokens → New token** (alcanza con permisos de lectura).
3. Copiá ese token y pegalo en `.env.local`:
   ```
   HUGGINGFACE_API_TOKEN=hf_xxxxxxxxxxxxxxxxxxxx
   ```
4. Reiniciá `npm run dev`.

A partir de ahí, cada foto que se suba se analiza automáticamente (vas a ver
"Análisis visual con IA activado" debajo del recuadro de foto). Si no
configurás esto, la app simplemente sigue comparando por color — no se rompe
nada, sólo es menos preciso.

**Cosas a tener en cuenta:**
- El primer llamado al modelo puede tardar ~20 segundos (Hugging Face lo
  "despierta" bajo demanda si nadie lo usó hace rato). Es normal.
- El tier gratuito de Hugging Face tiene límites de uso — para un piloto
  chico alcanza sin problema.
- Los reportes de ejemplo (los 5 que se cargan solos) no usan IA, así que la
  comparación con ellos siempre cae al color. Es esperable.

---

## 2.3 Activar el mapa interactivo con pin (opcional)

Por defecto, para marcar la ubicación se usa el botón "Usar mi ubicación"
(la posición GPS del dispositivo). Para que además se pueda tocar/arrastrar
un pin en un mapa real de Google:

1. Entrá a [console.cloud.google.com](https://console.cloud.google.com).
2. Creá un proyecto (o usá uno existente).
3. Andá a **APIs & Services → Library**, buscá **"Maps JavaScript API"** y activala.
4. Andá a **APIs & Services → Credentials → Create Credentials → API key**.
5. **Importante:** editá esa key y restringila ("Application restrictions" →
   "HTTP referrers") a tu dominio (y a `localhost:3000` para probar local).
   Sin esta restricción, cualquiera podría usar tu clave desde otro sitio.
6. Copiá la key y pegala en `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=tu-clave-de-google-maps
   ```
7. Reiniciá `npm run dev`.

Google exige una cuenta de facturación para usar Maps, pero regala ~$200
USD de crédito mensual — para un piloto con tráfico bajo no vas a pagar nada.

Si no configurás esto, el formulario de reporte muestra un aviso y la gente
igual puede marcar su ubicación con el botón de geolocalización — el mapa es
un plus, no un requisito.

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
      api/embed/route.js    ← ruta de servidor: pide el embedding de IA a Hugging Face
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
- **Matching por color por defecto, con IA real opcional.** Sin configurar
  `HUGGINGFACE_API_TOKEN`, el matching de imagen sigue siendo una aproximación
  liviana (histograma de color). Configurándolo (sección 2.2), se usa un
  modelo de visión real (CLIP) para comparar forma, raza aparente y patrón —
  mucho más preciso que el color solo.
- **Sin rate limiting.** Nada impide que alguien publique reportes en bucle.
  Para producción conviene agregar límites (por IP o por usuario autenticado).

---

## 7. Costos esperados

Con tráfico bajo/moderado (cientos de usuarios activos), esto corre
íntegramente en los tiers gratuitos de Supabase y Vercel — **$0/mes**. Los
primeros costos reales aparecen si el volumen de fotos o reportes crece mucho
(Supabase Pro ronda los $25/mes) o si necesitás más ancho de banda del que
regala el tier gratuito de Vercel.
