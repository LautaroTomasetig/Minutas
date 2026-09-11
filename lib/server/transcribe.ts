import "server-only";
import { MAX_AUDIO_BYTES } from "@/lib/audio";
import { transcribeResponseSchema } from "@/lib/schemas/api";
import { aiClient } from "./ai";
import { setTimeout as delay } from "node:timers/promises";
import { ServiceError } from "./errors";

export async function validateAudio(
  file: FormDataEntryValue | null,
): Promise<File> {
  if (!(file instanceof File) || !file.size)
    throw new ServiceError(
      "MISSING_AUDIO",
      "Seleccioná o grabá un audio con contenido.",
    );
  if (file.size > MAX_AUDIO_BYTES)
    throw new ServiceError(
      "AUDIO_TOO_LARGE",
      "El audio supera el máximo de 24 MB.",
      413,
    );
  const mime = file.type.split(";")[0].toLowerCase();
  if (
    ![
      "audio/webm",
      "video/webm",
      "audio/mp4",
      "video/mp4",
      "audio/x-m4a",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
    ].includes(mime)
  )
    throw new ServiceError(
      "UNSUPPORTED_AUDIO",
      "Usá un archivo WebM, MP4, M4A, MP3 o WAV.",
      415,
    );
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const text = new TextDecoder("ascii").decode(bytes);
  const valid = mime.includes("webm")
    ? bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    : mime.includes("mp4") || mime.includes("m4a")
      ? text.slice(4, 8) === "ftyp"
      : mime.includes("wav")
        ? text.startsWith("RIFF") && text.slice(8, 12) === "WAVE"
        : text.startsWith("ID3") ||
          (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (!valid)
    throw new ServiceError(
      "INVALID_AUDIO",
      "El contenido del archivo no coincide con su formato de audio.",
      422,
    );
  return file;
}
export async function transcribe(file: File, signal: AbortSignal) {
  signal.throwIfAborted();
  const client = aiClient();
  const originalMime = file.type.split(";")[0].toLowerCase();
  const mimeType = originalMime.includes("webm")
    ? "audio/webm"
    : originalMime.includes("mp4") || originalMime.includes("m4a")
      ? "audio/m4a"
      : originalMime.includes("wav")
        ? "audio/wav"
        : "audio/mpeg";
  let uploadedName: string | undefined;
  let stage = "files_upload";
  let stageStarted = performance.now();
  const measure = () =>
    console.info("[audio] gemini", {
      stage,
      durationMs: Math.round(performance.now() - stageStarted),
    });
  try {
    // Some SDK upload stages do not forward abortSignal. The route's total
    // timeout still bounds the response; a late upload is cleaned up in finally.
    let uploaded = await client.files.upload({
      file: file.slice(0, file.size, mimeType),
      config: { mimeType, abortSignal: signal },
    });
    uploadedName = uploaded.name;
    measure();
    stage = "files_wait";
    stageStarted = performance.now();
    signal.throwIfAborted();
    while (uploaded.state === "PROCESSING" && uploadedName) {
      await delay(1000, undefined, { signal });
      uploaded = await client.files.get({
        name: uploadedName,
        config: { abortSignal: signal },
      });
      signal.throwIfAborted();
    }
    if (!uploadedName || !uploaded.uri || uploaded.state !== "ACTIVE")
      throw new ServiceError(
        "INVALID_PROVIDER_RESPONSE",
        "El proveedor no pudo preparar el audio para transcribirlo.",
        502,
      );
    measure();
    stage = "model";
    stageStarted = performance.now();
    const result = await client.interactions.create(
      {
        model: "gemini-3.5-transcribe",
        store: false,
        input: [{ type: "audio", uri: uploaded.uri, mime_type: mimeType }],
        generation_config: {
          transcription_config: { language_codes: [], mode: "verbatim" },
        },
      },
      { signal, maxRetries: 0, timeout: 150_000 },
    );
    measure();
    if (result.status !== "completed" || typeof result.output_text !== "string")
      throw new ServiceError(
        "INVALID_PROVIDER_RESPONSE",
        "La transcripción recibida está incompleta.",
        502,
      );
    if (!result.output_text.trim())
      throw new ServiceError(
        "NO_SPEECH",
        "No se detectó voz en el audio. Revisá que se escuche la conversación.",
        422,
      );
    const response = transcribeResponseSchema.safeParse({
      success: true,
      transcript: result.output_text,
      // Unary Transcribe detects speech but its documented response has no language code.
      detectedLanguage: "und",
    });
    if (!response.success)
      throw new ServiceError(
        "TRANSCRIPT_TOO_LONG",
        "La transcripción supera el tamaño admitido por este MVP. Conservá el audio para procesarlo en partes.",
        422,
      );
    return response.data;
  } catch (error) {
    console.info("[audio] gemini_failure", {
      stage,
      durationMs: Math.round(performance.now() - stageStarted),
    });
    throw error;
  } finally {
    if (uploadedName) {
      // Cleanup has its own short deadline, even if the request was cancelled.
      await client.files
        .delete({
          name: uploadedName,
          config: {
            abortSignal: AbortSignal.timeout(3000),
            httpOptions: { timeout: 3000, retryOptions: { attempts: 1 } },
          },
        })
        .catch(() => {
          // Never log provider errors or file URIs. Google expires files in 48h.
        });
    }
  }
}
