# Publicar Felpus en Google Play — guía paso a paso

Felpus ya es una PWA, así que **no hay que programar una app nueva**: se
"envuelve" felpus.com en una app de Android (se llama *Trusted Web Activity*).
La app abre felpus.com a pantalla completa, sin barra del navegador, y
**cualquier cambio que se publique en la web aparece solo en la app**, sin
subir versiones nuevas a Play.

La herramienta es **PWABuilder** (web gratuita de Microsoft): le das la
dirección y te devuelve el archivo `.aab` listo para subir.

> Datos fijos que vas a usar varias veces:
> - **Nombre del paquete (ID de la app):** `com.felpus.app` — no se puede cambiar nunca después de subirla.
> - **Política de privacidad:** `https://felpus.com/privacidad`
> - **Eliminar cuenta:** `https://felpus.com/eliminar-cuenta`
> - **Email de contacto:** `contacto.felpus@gmail.com`
> - **Imágenes para la ficha:** carpeta `docs/play-store/` de este repo.

---

## Paso 0 — Antes de empezar: mergear la rama `play-store-twa`

1. Entrá a https://github.com/santibarron23/felpus-web
2. Arriba va a aparecer un cartel amarillo **"play-store-twa had recent pushes"** → botón **Compare & pull request**.
3. Botón verde **Create pull request** → después **Merge pull request** → **Confirm merge**.
4. Esperá que Vercel termine de publicar (2-3 minutos) y comprobá que abre https://felpus.com/eliminar-cuenta.

Esto agrega: la página para pedir eliminar la cuenta (Google la exige), los
íconos adaptados a Android, ajustes del manifest y la dirección
`felpus.com/.well-known/assetlinks.json` (la "prueba" de que la app y la web
son del mismo dueño; por ahora devuelve `[]`, se completa en el Paso 5).

---

## Paso 1 — Crear la cuenta de desarrollador (esto lo hacés vos)

1. Entrá a https://play.google.com/console/signup con la cuenta de Google que quieras que sea dueña de la app (conviene `contacto.felpus@gmail.com`).
2. Elegí **"Para ti" / cuenta personal** (la de organización pide número D-U-N-S y es más lío).
3. Completá tus datos y pagá **USD 25** (pago único, con tarjeta que acepte pagos internacionales).
4. Google te pide **verificar identidad** (foto del DNI) y **verificar un celular Android** (te pide instalar la app *Play Console* en el teléfono). Puede tardar de unas horas a unos días.

---

## Paso 2 — Generar la app con PWABuilder

1. Entrá a https://www.pwabuilder.com
2. Escribí `https://felpus.com` → **Start**. Espera que analice (te muestra un puntaje; no hace falta que sea perfecto).
3. Botón **Package For Stores** → en **Android** tocá **Generate Package**.
4. Se abre un formulario. Completá así (lo que no nombro, dejalo como está):
   - **Package ID:** `com.felpus.app` ← importante, exactamente así
   - **App name:** `Felpus` · **Short name:** `Felpus`
   - **Version:** `1.0.0` · **Version code:** `1`
   - **Host:** `felpus.com` · **Start URL:** `/`
   - En **All Settings**:
     - **Notification delegation:** activado (para las alertas push)
     - **Location delegation:** activado (para "más cercanas" y el mapa)
     - **Signing key:** **Create new** → completá nombre (`Santiago Barron`), organización (`Felpus`), país (`AR`). Las contraseñas las genera solo.
5. **Download Package**. Baja un `.zip`. Adentro hay:
   - `Felpus.aab` → **este es el que se sube a Play**
   - `Felpus.apk` → para probar instalando a mano en un Android
   - `signing.keystore` y `signing-key-info.txt` → **la llave de la app**
6. ⚠️ **Guardá el .zip entero en dos lugares seguros** (ej. Google Drive + un pendrive). Sin `signing.keystore` y su contraseña no vas a poder subir actualizaciones nuevas del `.aab` (se puede recuperar pidiéndoselo a Google, pero tarda días).

---

## Paso 3 — Crear la app en Play Console

1. En https://play.google.com/console → **Crear app**.
2. Nombre: `Felpus` · Idioma: **Español (Latinoamérica) – es-419** · **App** (no juego) · **Gratis**.
3. Tildá las dos declaraciones → **Crear app**.

Play Console te muestra una lista de tareas en **Panel**. Vamos una por una.

### 3.1 Configurar la app ("Configura tu app")

| Tarea | Qué poner |
|---|---|
| **Política de privacidad** | `https://felpus.com/privacidad` |
| **Acceso a la app** | "Todas las funciones o algunas están restringidas" → instrucción: *"Se puede usar sin cuenta. Para publicar con cuenta, iniciar sesión con cualquier cuenta de Google (botón 'iniciar sesión con Google')."* |
| **Anuncios** | No, la app no tiene anuncios |
| **Clasificación de contenido** | Ver 3.2 |
| **Público objetivo** | Solo **18 y más** (evita las reglas extra de apps para chicos) · "¿Atrae a niños?" → No |
| **Seguridad de los datos** | Ver 3.3 |
| **Apps gubernamentales / financieras / de salud / noticias** | No / Ninguna / Ninguna / No |
| **Categoría** | App → **Estilo de vida** · email `contacto.felpus@gmail.com` · sitio `https://felpus.com` |

### 3.2 Clasificación de contenido (cuestionario IARC)

- Email: `contacto.felpus@gmail.com` · Categoría: **Todas las demás tipos de apps** (o "Redes sociales/comunicación" si aparece)
- Violencia, sexo, lenguaje, drogas, apuestas: **No** a todo.
- **¿Los usuarios pueden interactuar o intercambiar contenido?** → **Sí** (publican fotos y se contactan por WhatsApp).
- **¿Comparte la ubicación del usuario con otros?** → **Sí** (la zona de la publicación es pública).
- **¿Compras digitales?** → No.
- Guardar → **Enviar**. Va a dar una clasificación tipo "Mayores de 13/Para todos con supervisión", está bien.

### 3.3 Seguridad de los datos

1. **¿Recopila o comparte datos?** → Sí.
2. **¿Están encriptados en tránsito?** → Sí.
3. **¿Los usuarios pueden pedir que se borren?** → Sí, y en "URL para eliminar cuenta" poné `https://felpus.com/eliminar-cuenta`.
4. Tipos de datos — marcá estos, todos como **Recopilados** (no "compartidos"), **no procesados de forma efímera**, **obligatorio = No (opcional)** salvo donde dice:

| Tipo | Para qué (finalidad) |
|---|---|
| Ubicación → **Ubicación aproximada** y **Ubicación precisa** | Funcionalidad de la app |
| Información personal → **Nombre** | Funcionalidad de la app, Administración de la cuenta |
| Información personal → **Dirección de correo** | Administración de la cuenta |
| Información personal → **IDs de usuario** | Administración de la cuenta |
| Información personal → **Número de teléfono** | Funcionalidad de la app (contacto por WhatsApp) |
| Fotos y videos → **Fotos** | Funcionalidad de la app |
| Actividad en la app → **Interacciones con la app** | Estadísticas (Google Analytics) |
| Info y rendimiento de la app → **Registros de fallas** y **Diagnóstico** | Estadísticas, Funcionalidad |
| ID del dispositivo u otros IDs | Estadísticas (Google Analytics) |

### 3.4 Ficha de Play Store ("Ficha principal de Play Store")

- **Nombre:** `Felpus: mascotas perdidas`
- **Descripción breve (máx. 80):**
  `Reportá y encontrá mascotas perdidas en Salta. Subí una foto y te avisamos.`
- **Descripción completa:**

  ```
  Felpus ayuda a que cada mascota perdida vuelva a casa.

  ¿Perdiste a tu perro o gato? ¿Encontraste uno en la calle? Publicalo en Felpus en menos de un minuto: subís una foto, marcás la zona en el mapa y listo.

  • Coincidencias automáticas: Felpus compara las fotos de mascotas perdidas y encontradas y te muestra las que más se parecen.
  • Mapa y búsqueda por zona: mirá qué mascotas se perdieron o aparecieron cerca tuyo.
  • Alertas: recibí un aviso cuando se publica una mascota en tu zona.
  • Contacto directo por WhatsApp con quien publicó.
  • Flyers listos para imprimir o compartir en redes.
  • Gratis y sin publicidad.

  Hecho en Salta, Argentina, para toda la comunidad.
  ```

- **Ícono (512×512):** `docs/play-store/icono-512.png`
- **Gráfico destacado (1024×500):** `docs/play-store/grafico-destacado-1024x500.png`
- **Capturas de teléfono (mínimo 2):** las 4 `docs/play-store/captura-*.png`
  (la 4 muestra una publicación real de la web; si preferís, reemplazala por otra captura tuya).
- Tablets: dejarlo vacío está bien.

Para bajar las imágenes desde GitHub: abrí cada archivo en
`https://github.com/santibarron23/felpus-web/tree/main/docs/play-store` →
botón de descarga (flechita ↓ arriba a la derecha).

---

## Paso 4 — Prueba cerrada (obligatoria: 12 personas durante 14 días)

Las cuentas personales nuevas **no pueden publicar directo**: primero tienen
que tener una prueba cerrada con **al menos 12 testers** que la tengan
instalada **14 días seguidos**. Conviene arrancar esto lo antes posible.

1. Menú izquierdo → **Prueba y lanzamiento → Pruebas → Prueba cerrada** → **Crear segmento** (o usar "Alpha").
2. **Países:** Argentina.
3. **Testers:** **Crear lista de correo** → pegá los **Gmail** de al menos 12 personas (amigos, familia, voluntarios de rescatistas; mejor 15 por si alguno falla).
4. **Crear versión** → acepta **Firma de apps de Play** (Google guarda la llave final) → subí `Felpus.aab` → nombre de versión `1.0.0` → notas: `Primera versión`.
5. **Revisar versión** → **Iniciar lanzamiento a prueba cerrada**. Google la revisa (de horas a unos días).
6. Cuando esté aprobada, en la pestaña **Testers** copiá el **"Vínculo para unirse"** y mandáselo a los testers. Cada uno tiene que: abrir el link **con el mismo Gmail** que diste → **"Convertirse en tester"** → instalar Felpus desde Play → **no desinstalarla en 14 días** (y abrirla de vez en cuando).

---

## Paso 5 — Sacar la barra del navegador (assetlinks)

Si al abrir la app ves una barrita con "felpus.com" arriba, falta este paso.
Hacelo apenas subas el `.aab` (Paso 4.4):

1. Play Console → **Prueba y lanzamiento → Configuración → Integridad de la app** → pestaña **Firma de apps**.
2. Vas a ver dos certificados: **"Certificado de la clave de firma de apps"** y **"Certificado de la clave de carga"**. De cada uno copiá la línea **SHA-256** (es tipo `AB:CD:12:...`, 32 pares).
3. Entrá a https://vercel.com → proyecto **felpus-web** → **Settings → Environment Variables** → **Add New**:
   - **Key:** `ANDROID_SHA256_CERT_FINGERPRINTS`
   - **Value:** las dos huellas pegadas **separadas por una coma**
   - Entorno: **Production** → **Save**
4. **Deployments** → en el último, los tres puntitos **⋯ → Redeploy**.
5. Comprobá que https://felpus.com/.well-known/assetlinks.json ya muestre `com.felpus.app` y tus huellas.
6. En el celular: desinstalá y volvé a instalar Felpus. La barra ya no tiene que aparecer (a veces tarda unos minutos).

---

## Paso 6 — Pasar a producción (después de los 14 días)

1. En **Panel** aparece **"Solicitar acceso a producción"** cuando se cumplen los 12 testers × 14 días.
2. Respondé el cuestionario (cómo reclutaste testers, qué feedback recibiste, qué cambiaste). Contestá con lo real, breve.
3. Google lo revisa (hasta ~7 días). Cuando lo aprueba: **Producción → Crear versión → Agregar desde biblioteca** (el mismo `.aab`) → **Iniciar lanzamiento a producción**.
4. 🎉 Felpus aparece en Play Store (la primera revisión puede tardar unos días).

---

## Después: actualizaciones

- **Cambios en la web** (diseño, funciones, textos): se ven solos en la app. No hay que hacer nada en Play.
- **Hace falta un `.aab` nuevo solo si** cambiás el nombre, el ícono de la app o la configuración de Android. En ese caso, en PWABuilder usá **Signing key → Use mine** con el `signing.keystore` guardado, y subí **Version code** en 1 (`2`, `3`, ...).

## Problemas comunes

- **"Tu app tiene contenido en webview / spam / funcionalidad mínima":** a veces Google rechaza apps web. Respondé en la apelación que es una Trusted Web Activity de un servicio propio (felpus.com) con funciones reales: publicación de reportes, mapa, coincidencias por foto, notificaciones.
- **El login con Google abre una ventanita de Chrome:** es normal en este tipo de app y vuelve sola a Felpus.
- **No llegan notificaciones:** en el celular, Ajustes → Apps → Felpus → Notificaciones → activadas.
