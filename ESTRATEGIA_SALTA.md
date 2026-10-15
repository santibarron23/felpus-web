# Estrategia de alcance orgánico — Felpus en Salta (2026-10-15)

## Diagnóstico

- El home (`/`) es una SPA 100% cliente y `/r/<id>` redirige por JS: Google
  no tenía **ninguna** página con texto real sobre "mascotas perdidas en Salta".
- Los reportes viven en Salta (10 perdidas + 2 encontradas activas al día de
  hoy), pero ese contenido no era indexable como conjunto.
- **GA4 no estaba midiendo nada**: el CSP bloqueaba `region1.google-analytics.com`
  (a donde gtag.js manda los eventos). Sin esto no se puede medir el alcance.

## Objetivo

Aparecer en Google para búsquedas locales de alta intención —"perro perdido
Salta", "mascotas perdidas Salta", "encontré un gato Salta", "perro perdido
Tres Cerritos"— y convertir esas visitas en reportes publicados.

KPIs (Search Console + GA4, revisar cada 2 semanas):
- Impresiones y clics orgánicos de `/mascotas-perdidas/salta`.
- Posición media para "mascotas perdidas salta" y "perro perdido salta".
- Reportes nuevos/semana en Salta y reencuentros.

## Ejecutado (en este repo)

1. **Página local** `/mascotas-perdidas/salta` (server-rendered, ISR 10 min):
   - H1, title y description con la keyword + ciudad.
   - Listado real de mascotas perdidas y encontradas en Salta (foto, zona,
     descripción) con link a cada `/r/<id>` → contenido fresco que cambia solo.
   - Guía "Qué hacer si perdiste tu mascota en Salta".
   - 20 barrios/localidades del Gran Salta como texto (long tail por barrio).
   - FAQ de 5 preguntas.
   - JSON-LD: `CollectionPage` + `ItemList` + `BreadcrumbList` + `FAQPage`.
   - Excluye reportes ocultos y los de ejemplo (`seed-*`, sin contacto).
   - Datos en `src/lib/cities.js`: sumar otra ciudad es agregar una entrada.
2. **Link interno** desde el footer del home ("Mascotas perdidas en Salta").
3. **Sitemap** incluye la página (prioridad 0.9, diaria).
4. **Meta description global** menciona "Salta y toda Argentina".
5. **Fix CSP GA4**: `*.google-analytics.com` en `connect-src`/`img-src`.

## Pasos que tenés que hacer vos (no los puedo hacer sin tus cuentas)

1. **Deploy** (push a la rama que despliega Vercel).
2. **Google Search Console** (search.google.com/search-console): verificar
   `felpus.com`, enviar `https://felpus.com/sitemap.xml` y en "Inspección de
   URLs" pedir indexación de `https://felpus.com/mascotas-perdidas/salta`.
3. **GA4**: después del deploy, abrir Tiempo real y confirmar que llegan visitas.
4. **Google Business Profile**: crear perfil como "servicio en el área" (sin
   dirección pública) con área Salta Capital y alrededores, link a la página
   local. Es la vía más rápida a aparecer en búsquedas de Maps.
5. **Backlinks locales** (lo que más mueve el ranking de una página nueva):
   pedir que enlacen a `/mascotas-perdidas/salta` veterinarias, refugios y
   protectoras de Salta, y medios locales (una nota "app salteña para
   encontrar mascotas" es un link muy valioso).
6. **Compartir con link**: en grupos de Facebook/WhatsApp de mascotas perdidas
   de Salta, responder publicaciones con el link del reporte o de la página
   local (aporta tráfico y señales de marca).

## Próximas mejoras sugeridas (no ejecutadas)

- Que `/r/<id>` muestre la ficha renderizada en el servidor en vez de
  redirigir por JS: cada mascota sería una página indexable por sí misma.
- Páginas por especie (`/mascotas-perdidas/salta/perros`, `/gatos`) cuando haya
  volumen suficiente para que no sean contenido delgado.
- Preguntar "¿sigue perdida?" a los 30 días (ver PENDIENTE_DECISION.md): una
  lista con reportes viejos y vencidos baja la calidad percibida de la página.
