# Minutas

Aplicación web para grabar reuniones desde el micrófono y transformarlas en minutas empresariales editables y exportables a PDF.

## Ejecutar localmente

Requiere Node.js 24 y npm. Las versiones están fijadas en `package.json` y `package-lock.json`.

```sh
npm ci
```

Para una instalación nueva, copiar `.env.example` a `.env.local` e ingresar la clave de Gemini allí. Si `.env.local` ya existe, conservarlo:

```dotenv
GEMINI_API_KEY=
```

`GEMINI_API_KEY` se utiliza exclusivamente en el servidor y debe tener un valor real para transcribir, traducir y generar minutas. Nunca usar `NEXT_PUBLIC_` para secretos. Los archivos `.env*` están excluidos de Git excepto `.env.example`.

```sh
npm run dev
```

Abrir http://localhost:3000. En PowerShell con scripts deshabilitados, usar `npm.cmd` en lugar de `npm`. Reiniciar el servidor después de cambiar las variables de entorno. Sin clave se puede usar el formulario, grabar y descargar audio; las APIs de IA devuelven un error explícito de configuración, sin simular resultados.

Para ejecutar la compilación de producción:

```sh
npm run build
npm run start -- --hostname 127.0.0.1
```

## Uso

1. Crear una reunión con título, autor y fecha/hora. Lugar y participantes son opcionales. Cada participante puede tener un área.
2. Iniciar y aceptar el permiso del micrófono. La grabación comienza en el navegador.
3. Pausar/reanudar según sea necesario. Finalizar requiere confirmación.
4. Escuchar o descargar el audio y elegir **Procesar reunión**.
5. El servidor transcribe el audio original y luego genera una minuta en español. La interfaz muestra las operaciones reales, sin porcentajes inventados.
6. Revisar los datos, la introducción y cada punto. Los campos desconocidos aparecen como **No especificado**.
7. Editar, agregar o eliminar puntos. Aplicar cambios antes de exportar.
8. Exportar PDF. El archivo usa exclusivamente los datos editados y validados.

La transcripción original queda disponible debajo de la minuta. **Traducir al español** genera una versión textual separada; no reemplaza el original ni es necesario para obtener la minuta en español.

## Alcance y límites

- Los datos viven en memoria en esta pestaña. No hay historial, cuentas ni base de datos. Cerrar o recargar pierde la sesión; se ofrece descarga de audio y texto, y advertencia al salir.
- Se captura solo el micrófono, no el sonido del sistema ni automáticamente el audio remoto de Meet/Teams/Zoom.
- `getUserMedia` requiere HTTPS o localhost. Probado en Edge con dispositivo de audio sintético; quedan pendientes pruebas físicas y la matriz completa de navegadores, especialmente Safari/iOS y suspensión de dispositivos.
- Hasta 60 minutos y 24 MB por audio. Se solicita 64 kbps al navegador y se detiene preventivamente al recibir 22 MB. Si un último fragmento excede el límite, la subida se rechaza y sigue disponible la descarga. Los límites son independientes de la duración.
- WebM/Opus o MP4 según soporte del navegador. El endpoint también admite M4A, MP3 y WAV. Se valida MIME y firma inicial; el proveedor valida la decodificación completa.
- Hasta 120.000 caracteres de transcripción, 80 temas y 100 participantes. Una traducción extensa puede superar el límite de salida del modelo: se devuelve error y se conserva el original.
- El idioma detectado es el principal; no se promete identificación completa de todos los idiomas o hablantes.
- La IA puede cometer errores semánticos aunque el JSON sea válido. Deben revisarse hechos, nombres, fechas y decisiones antes de compartir el documento. Los tests no certifican ausencia de alucinaciones.
- El PDF usa Inter Latin local, apropiada para español y nombres en alfabeto latino; otras escrituras pueden requerir fuentes adicionales. La minuta de referencia se utilizó para describir el formato y el nivel de detalle en el prompt; no se envía a la IA. La migración de proveedor conserva la plantilla PDF existente.

## Arquitectura

Una aplicación Next.js App Router, React y TypeScript, con endpoints REST en el mismo proyecto. Estado local en el workspace; captura aislada en `useAudioRecorder`; cliente HTTP central; schemas Zod compartidos. CSS separado por pantalla con variables globales. Sin Redux, ORM ni servidor adicional.

```text
app/
  page.tsx                     Inicio
  reuniones/nueva/page.tsx      Flujo de reunión
  api/transcribe/route.ts       Audio → transcripción
  api/translate/route.ts        Transcripción → español
  api/minutes/route.ts          Transcripción → minuta
  api/pdf/route.ts              Minuta editada → PDF
components/
  meeting/                     Formulario, grabador, procesamiento y editor
  ui/ConfirmDialog.tsx         Confirmación accesible
hooks/useAudioRecorder.ts      Captura, pausas y limpieza de recursos
lib/
  api/                         HTTP, AbortController y validación de respuestas
  schemas/                     Contratos y tipos derivados con Zod
  server/                      SDK, extracción, validación, límites y timeouts
  pdf/                         Plantilla y renderizado determinista
scripts/browser-smoke.mjs       Verificación reproducible en navegador
```

Los chunks del grabador se acumulan y se ensamblan al finalizar. Captura y procesamiento están separados para agregar transcripción progresiva posteriormente. Los chunks no se consideran archivos independientes decodificables.

## Contratos REST

| Endpoint               | Entrada                                         | Respuesta exitosa                                 |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `POST /api/transcribe` | `{ audioRef: { key, extension } }`          | `{ success: true, transcript, detectedLanguage }` |
| `POST /api/translate`  | `{ transcript }`                                | `{ success: true, translatedTranscript }`         |
| `POST /api/minutes`    | `{ transcript, meeting, outputLanguage: "es" }` | `{ success: true, minutes }`                      |
| `POST /api/pdf`        | JSON completo de la minuta                      | Archivo `application/pdf`                         |

Los errores usan el mismo contrato, incluso en el endpoint de PDF:

```json
{
  "success": false,
  "error": {
    "code": "AI_NOT_CONFIGURED",
    "message": "El servicio de IA todavía no está configurado."
  }
}
```

Estados principales: 400 validación, 413 tamaño, 415 formato, 422 contenido no procesable, 429 límite del proveedor, 502 respuesta externa inválida, 503 configuración y 504 timeout. Mensajes externos y secretos nunca se devuelven literalmente al navegador.

Las rutas de IA aplican timeout total, límites a los bytes leídos incluso sin `Content-Length`, y señales de cancelación hasta el proveedor. El cliente valida JSON y PDFs, diferencia errores HTTP/red/timeout/cancelación y conserva resultados previos para reintentar. Cancelar una solicitud no garantiza que el proveedor deje de procesarla o cobrarla una vez aceptada. No hay reintentos automáticos de operaciones pagas.

## Integración de IA

- SDK oficial `@google/genai`, Interactions API, `gemini-3.5-transcribe` para transcripción y `gemini-3.5-flash-lite` para minutas y traducción. Las llamadas usan `store: false`, sin herramientas externas ni reintentos automáticos.
- Transcripción: audio original por Files API, modo verbatim con respuesta textual en el idioma original y detección automática de voz. Se eliminan los parámetros MIME de codecs y se normaliza WebM a `audio/webm`, MP4/M4A de audio a `audio/m4a` y WAV a `audio/wav`, conservando los bytes.
- Files API evita el límite inline de 20 MB, manteniendo los 24 MB de la aplicación. Se espera el estado activo y se intenta eliminar el archivo al terminar, incluso ante errores. Si la eliminación falla, Google expira los archivos a las 48 horas. La limpieza tiene un plazo independiente de 3 segundos.
- El timeout total se mantiene en 150 segundos (100 para traducción). Algunos pasos de subida del SDK no propagan la señal de cancelación: la respuesta del endpoint igual se interrumpe a tiempo y una subida que termine tarde se limpia sin iniciar la transcripción.
- En minutas y traducción, la salida JSON se solicita con el esquema derivado de Zod 4 y se valida de nuevo localmente. La conversión de JSON Schema no cambia los contratos de la aplicación.
- La salida del modelo contiene solamente introducción y temas. Título, autor, fecha, hora, lugar, participantes y numeración se componen en código desde metadatos validados.
- Decisión, acción, responsable, fecha límite, pendiente y estado son campos separados. No hay un estado predeterminado. Los prompts distinguen sugerencias de acuerdos e indican tratar la transcripción como datos, nunca como instrucciones.
- Los schemas se validan de nuevo antes de responder. Rechazos, respuestas incompletas y datos fuera del contrato producen errores recuperables.
- No se registran audios, transcripciones ni credenciales en logs de la aplicación. Audio y texto se envían a Google Gemini cuando se solicita procesamiento; `store: false` no equivale por sí solo a una política de retención nula del proveedor.

Referencias: [SDK oficial](https://googleapis.github.io/js-genai/release_docs/index.html), [audio](https://ai.google.dev/gemini-api/docs/audio), [Files API](https://ai.google.dev/gemini-api/docs/files), [salidas estructuradas](https://ai.google.dev/gemini-api/docs/structured-output), [modelo](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).

Google publica free tier para este modelo. Las cuotas RPM/TPM/RPD son por proyecto y se consultan en AI Studio; la disponibilidad pública no garantiza cuota suficiente para reuniones largas. El free tier puede utilizar contenido para mejorar productos de Google: usar audios ficticios en desarrollo. `store: false` y borrar archivos no cambian esas condiciones. [Precios](https://ai.google.dev/gemini-api/docs/pricing), [cuotas](https://ai.google.dev/gemini-api/docs/rate-limits).

## PDF

`lib/pdf` no importa ningún servicio de IA. Recibe una minuta validada y genera A4 con encabezado, participantes por área, datos generales, introducción, puntos, acciones, responsables, estado y numeración de páginas. Fuentes empaquetadas localmente con trazado de archivos para Next.js.

Los metadatos de creación/modificación se fijan a una fecha constante, eliminando el reloj de exportación del archivo. Con iguales datos y versiones fijadas, los tests verifican igualdad binaria, incluso al cambiar la fecha del sistema. La fecha de la reunión se imprime desde sus propios datos.

## Verificación

```sh
npm run test
npm run lint
npm run typecheck
npm run build
npm run format:check
```

Vitest + React Testing Library cubren formulario, permisos y ciclo del grabador, cliente HTTP, límites de lectura, APIs con proveedor simulado, editor y PDF. No usan claves ni consumen API real.

Con la aplicación corriendo en el puerto 3000:

```sh
npm run smoke
```

El script usa Edge instalado en Windows, en modo headless, con micrófono sintético. En otras plataformas usa Chromium de Playwright (`npx playwright install chromium`). `SMOKE_BASE_URL` permite cambiar la URL. Simula las respuestas de Blob y de IA: el grabador, el editor y la exportación PDF son reales. Genera capturas, audio y PDF en `test-results/`, excluido de Git.

## Despliegue y etapas siguientes

Esta entrega es un MVP local. Antes de abrirlo al público, definir acceso/autenticación y cuotas para proteger los endpoints pagos. El hosting debe admitir las subidas y duración indicadas: `maxDuration` no amplía por sí solo los límites del proveedor de alojamiento. El transporte por Blob privado y subida directa se describe debajo; el procesamiento en segundo plano queda fuera de esta etapa.

No se implementaron las etapas 7 y 8: ampliación sistemática de casos límite y persistencia/historial. Los endpoints `POST/GET /api/meetings`, `GET /api/meetings/:id` y `PATCH /api/meetings/:id` corresponden a la etapa 8.

El repositorio incluye `.gitignore`, dependencias fijadas y documentación. No se publicó en GitHub ni se desplegó a un servicio externo.

## Vercel Blob privado: primera etapa

El navegador pide autorización a `POST /api/audio/upload` con `{ mimeType, size }` (máximo 4 KB). El servidor genera una referencia aleatoria de 256 bits y un pathname `meeting-audio/<sha256 de la referencia>.<extensión>`; cada autorización usa uno nuevo. No acepta URLs ni pathnames del cliente.

El SDK oficial `@vercel/blob` usa `issueSignedToken` y `presignUrl`: solo PUT, store privado, pathname exacto, MIME permitido, tamaño máximo igual al declarado (hasta 24 MB), vigencia de 3 minutos y `allowOverwrite: false`. El navegador recibe solo la URL con permiso restringido, nunca el material de firma ni las credenciales del store. La URL es una autorización temporal confidencial: puede repetirse hasta vencer si el archivo ya se eliminó; no es un token consumible una sola vez. La aplicación genera otra referencia al reintentar.

El navegador hace el PUT directamente a Vercel Blob. Luego `POST /api/transcribe` recibe `{ audioRef: { key, extension } }`, validado con Zod y limitado a 4 KB. El servidor deriva el pathname dentro de su propio store, lee con `get(..., { access: "private", useCache: false })`, limita los bytes, valida MIME/firma de audio y lo envía a Gemini Files API. El pathname no permite derivar la referencia aleatoria que autoriza procesamiento y borrado.

La transcripción usa `gemini-3.5-transcribe`, verbatim y detección automática, con respuesta textual. El contrato HTTP se valida con Zod. La respuesta unary documentada no expone un código de idioma: se devuelve `detectedLanguage: "und"` y la interfaz muestra “No determinado”. Minutas y traducción conservan `gemini-3.5-flash-lite`.

El `finally` intenta borrar Blob después del éxito, errores, cancelación o timeout. El borrado tiene un plazo independiente de 3 s y no oculta una transcripción exitosa. Solo registra el código técnico `BLOB_CLEANUP_FAILED`. Ante cancelación o fallo de red, el cliente intenta un POST pequeño al mismo endpoint con `{ audioRef, discard: true }` para borrar sin Gemini; no hay endpoint adicional de limpieza.

Se conservan 150 s de procesamiento servidor y 180 s de espera cliente; la limpieza puede añadir hasta 3 s al servidor. La subida directa tiene un plazo propio de 180 s. Los logs separan subida a Files API, espera y llamada al modelo sin contenidos, referencias, URLs ni credenciales. La respuesta incorpora `Server-Timing` y `X-Audio-Blob-Deleted`.

### Configuración y límites de esta etapa

- El store debe ser privado y estar conectado al entorno del despliegue. El SDK resuelve OIDC y `BLOB_STORE_ID` inyectados por Vercel. No se agrega token manual. Las credenciales del dashboard no aparecen automáticamente al ejecutar `next dev` localmente.
- `GEMINI_API_KEY` continúa en servidor. Next carga el `.env` existente. Esta implementación no modifica archivos privados de entorno.
- MVP sin login: Origin limita llamadas desde otras páginas, pero no impide llamadas directas ni abuso de cuota. Antes del uso empresarial multiusuario se deben agregar autenticación, autorización por usuario y límites de consumo.
- Sin cron, limpieza periódica, base de datos ni `vercel.json`. El cierre abrupto de pestaña, pérdida de conexión, terminación del proceso o fallo de borrado puede dejar huérfanos. No hay garantía de retención máxima para esos archivos: eliminarlos manualmente desde el store hasta la etapa siguiente.
- Se conservan corte preventivo de 22 MB, máximo de 24 MB y duración existente. Retirar los bytes de audio del request evita el límite de payload de 4,5 MB; no amplía cuotas, límites de grabación o duración de Functions.

Referencias: [PUT directo y URLs firmadas](https://vercel.com/docs/vercel-blob/vercel-signed-urls), [Blob privado](https://vercel.com/docs/vercel-blob/private-storage), [SDK y autenticación](https://vercel.com/docs/vercel-blob/using-blob-sdk), [Gemini Transcribe](https://ai.google.dev/gemini-api/docs/transcribe).
