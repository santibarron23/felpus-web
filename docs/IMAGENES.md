# Optimización de imágenes en Vercel (2026-10-21)

## El problema

Felpus usaba unas **4.500 de las 5.000 transformaciones gratis por mes** de
Vercel Image Optimization. Una "transformación" es cada vez que Vercel tiene
que generar una versión nueva de una imagen (un ancho, un formato, una
calidad) porque no la tiene guardada en su caché.

## Qué lo causaba

Medido el 2026-10-21 contra producción (61 reportes, 107 fotos distintas):

| Causa | Detalle | Efecto |
|---|---|---|
| **Caché de 1 hora** | Supabase sirve las fotos con `Cache-Control: public, max-age=3600`. Next usa ese valor como duración de la caché (el mínimo por defecto, `minimumCacheTTL`, es 60 s). | Cada foto optimizada se descartaba a la hora y se **volvía a transformar** en la siguiente visita. Es la causa principal: una misma foto podía transformarse decenas de veces por mes. |
| **16 anchos por foto** | Con la configuración por defecto, cada foto se ofrecía en 16 anchos (16 a 3840 px). Cada celular pide el que le corresponde según su pantalla (densidad 2x, 2,6x, 3x…). | Una misma foto terminaba transformada en 5 a 8 anchos distintos. Para la foto grande del detalle se pedían 1080, 1200 o 1920 px aunque las fotos se guardan con **1000 px como máximo**: el resultado era idéntico, pero cada uno contaba aparte. |
| **Calidades y anchos libres** | Sin `qualities` ni una lista corta de anchos, `/_next/image` aceptaba cualquier `w` y cualquier `q` (1 a 100). | Un bot o un crawler podía generar transformaciones sin límite pidiendo combinaciones nuevas. |
| **Avatares de Google** | `**.googleusercontent.com` estaba habilitado en `remotePatterns`, y el avatar pasaba por el optimizador. | Transformaciones por cada usuario logueado. Además, **cualquiera** podía pedir `/_next/image?url=<un archivo de googleusercontent>` y gastar la cuota de Felpus. |
| **Imágenes fijas** | La mascota del inicio (PNG de 62 KB), la lupa y el ícono de instalación pasaban por el optimizador. | Pocas, pero se repetían cada hora por la caché corta. |

## Qué se cambió

Todo en `next.config.mjs` y en cómo se muestran las imágenes. **No se tocó**
la lógica de reportes, el matching ni cómo se guardan las fotos en Supabase.

1. **Caché de 30 días** (`minimumCacheTTL: 2592000`). Es seguro porque las
   fotos nunca cambian: cada subida va a un archivo nuevo con un UUID y sin
   reemplazo (`uploadPhoto` en `store.js`).
   - *Efecto colateral:* si se borra un reporte, su foto optimizada puede
     seguir sirviéndose desde la caché de Vercel hasta 30 días para quien ya
     tenga esa URL exacta. El original de Supabase sí se borra al instante.
     Si eso preocupa, bajar el valor a 7 días (604800) mantiene casi todo el
     ahorro.
2. **7 anchos en vez de 16**: miniaturas de 64, 128, 256 y 384 px y foto
   grande de 640, 828 y 1080 px. Todas las miniaturas de la app (40 a 64 px)
   terminan en 64 o 128 px y comparten la misma versión guardada.
3. **Un formato (WebP) y una calidad (75)**. Cualquier otro `w`, `q` o host
   responde 400 sin gastar una transformación.
4. **Avatares de Google sin optimizar**: Google ya los entrega chicos
   (`=s96-c`). Se sacó `googleusercontent.com` de `remotePatterns`.
5. **Imágenes fijas servidas tal cual**: la mascota pasó a `mascot_hero.webp`
   (62 KB → 12 KB), y la lupa y el ícono van con `unoptimized`.
6. **Logo**: un solo WebP de 7 KB en vez del PNG de 2419 px (51 KB). Además,
   el logo blanco del modo noche, que ya no existe, se descargaba igual en
   cada visita (46 KB) y se quitó.
7. **Página de Salta**: mostraba las fotos originales (~100 KB cada una) a
   80 px con `<img>`. Ahora usa `next/image` con los mismos anchos que las
   miniaturas de la app, así que **reutiliza** esas versiones guardadas.

`src/lib/imageConfig.test.js` falla si alguien vuelve a abrir estos valores
(caché corta, muchos anchos, más calidades, avatares optimizados).

## Resultados esperados

- **Transformaciones:** de ~4.500 a **unas 600–900 por mes**, contando cada
  combinación de foto y ancho que se vea al menos una vez en 30 días: unas
  107 fotos actuales × ~3 anchos, más las fotos nuevas del mes. Es una
  estimación, porque depende de cuántas fotos se abran y desde qué
  pantallas.
  - Justo después del deploy hay un pico de una vez: como cambian los
    anchos, las URLs son nuevas y cada foto vista se transforma de nuevo.
- **Celular:** igual o mejor. Las miniaturas pesan entre 2 y 20 KB y la foto
  del detalle unos 50 KB en WebP, contra ~100 KB del JPEG original. El inicio
  baja unos 140 KB (mascota, logo y logo blanco).
- **Calidad visual:** sin cambios. El ancho más grande (1080 px) supera el
  de cualquier foto guardada (1000 px), y las miniaturas cubren pantallas 3x.

Medido con `next build` + `next start` sobre una foto real:

| Ancho | Peso |
|---|---|
| Original (JPEG) | 101 KB |
| 64 px | 2 KB |
| 128 px | 6 KB |
| 256 px | 20 KB |
| 384 px | 38 KB |
| 640 / 828 / 1080 px | 52 KB |

## Alternativas evaluadas

| Opción | Veredicto |
|---|---|
| **Desactivar la optimización en todo el sitio** (`unoptimized: true`) | **No.** Explorar muestra 40+ miniaturas: serían ~4 MB de JPEG originales en vez de ~0,3 MB en celular. Más lento en 3G/4G y más tráfico de Supabase (el plan gratis tiene 5 GB/mes de salida). |
| **Transformaciones de Supabase** (`/render/image`) | Solo en planes pagos de Supabase. Descartada: el plan pide herramientas gratis. |
| **Guardar miniaturas al subir la foto** (por ejemplo, 256 px además de la original) | Ahorraría casi todo, pero cambia cómo se guardan las fotos, y eso quedaba fuera de este trabajo. Es el paso siguiente si las transformaciones vuelven a subir. |
| **Cloudinary / ImageKit (planes gratis)** | Funcionan sin tarjeta, pero suman una cuenta, otra dependencia y otro punto de falla, y además las fotos de la comunidad pasarían por un tercero. Con los cambios de arriba no hace falta. Queda como plan B si Felpus crece mucho. |
| **Proxies abiertos (wsrv.nl / weserv)** | No: sin garantía de disponibilidad, y las fotos pasarían por un servicio sin contrato. |

## Cómo seguirlo

Vercel → proyecto → **Usage → Image Optimization**: mirar "Transformations"
unos días después del deploy. Si después del pico inicial sigue arriba de
~1.500 por mes, el siguiente paso es guardar miniaturas al subir la foto
(ver Alternativas).
