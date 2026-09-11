import { uploadPresigned } from "@vercel/blob/client";
import { audioUploadResponseSchema } from "@/lib/schemas/audioUpload";
import { request, requestPdf } from "./client";
import { MAX_AUDIO_BYTES } from "@/lib/audio";
import { ApiError } from "./client";
import {
  transcribeResponseSchema,
  translateResponseSchema,
} from "@/lib/schemas/api";
import { minutesResponseSchema } from "@/lib/schemas/minute";
import type { Meeting } from "@/lib/schemas/meeting";
import type { Minute } from "@/lib/schemas/minute";

export async function transcribeAudio(
  audio: Blob,
  signal: AbortSignal,
  onStage?: (stage: "uploading" | "transcribing") => void,
) {
  if (!audio.size || audio.size > MAX_AUDIO_BYTES)
    throw new ApiError(
      "INVALID_AUDIO",
      "El audio debe tener contenido y pesar hasta 24 MB. Podés descargarlo para conservarlo.",
    );
  const mimeType = audio.type.split(";")[0].toLowerCase();
  onStage?.("uploading");
  const authorization = await request(
    "/api/audio/upload",
    audioUploadResponseSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType, size: audio.size }),
      signal,
    },
  );
  let completed = false;
  const uploadSignal = AbortSignal.any([signal, AbortSignal.timeout(180_000)]);
  try {
    uploadSignal.throwIfAborted();
    const upload = uploadPresigned(authorization.pathname, audio, {
      access: "private",
      handleUploadUrl: "/api/audio/upload",
      clientPayload: JSON.stringify({
        audioRef: authorization.audioRef,
        mimeType,
        size: audio.size,
      }),
      contentType: mimeType,
      multipart: false,
      abortSignal: uploadSignal,
    });
    // The SDK's authorization fetch may not forward abortSignal. Bound the
    // entire SDK operation with the existing deadline without managing its HTTP protocol.
    let cancelUpload!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      cancelUpload = () => reject(uploadSignal.reason);
      uploadSignal.addEventListener("abort", cancelUpload, { once: true });
      if (uploadSignal.aborted) cancelUpload();
    });
    const uploaded = await Promise.race([upload, aborted]).finally(() =>
      uploadSignal.removeEventListener("abort", cancelUpload),
    );
    uploadSignal.throwIfAborted();
    if (uploaded.pathname !== authorization.pathname)
      throw new ApiError(
        "INVALID_UPLOAD_RESPONSE",
        "La referencia del audio subido no coincide con la esperada.",
      );
    signal.throwIfAborted();
    onStage?.("transcribing");
    const result = await request("/api/transcribe", transcribeResponseSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioRef: authorization.audioRef }),
      signal,
    });
    completed = true;
    return result;
  } catch (error) {
    if (signal.aborted)
      throw new ApiError(
        "CANCELLED",
        "Procesamiento cancelado. Tus datos siguen disponibles.",
      );
    if (error instanceof ApiError) throw error;
    if (uploadSignal.aborted)
      throw new ApiError(
        "TIMEOUT",
        "La subida tardó demasiado. Podés reintentar con el audio disponible.",
      );
    throw new ApiError(
      "UPLOAD_FAILED",
      "No pudimos completar la subida del audio. Revisá tu conexión y volvé a intentar.",
    );
  } finally {
    if (!completed) {
      // Best effort after cancellation/network failure, using the same endpoint.
      // No orphan endpoint or periodic infrastructure.
      await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioRef: authorization.audioRef,
          discard: true,
        }),
        signal: AbortSignal.timeout(5000),
        keepalive: true,
      }).catch(() => {});
    }
  }
}
export function translateTranscript(transcript: string, signal: AbortSignal) {
  return request("/api/translate", translateResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
    signal,
    timeoutMs: 120_000,
  });
}
export function generateMinute(
  transcript: string,
  meeting: Meeting,
  signal: AbortSignal,
) {
  return request("/api/minutes", minutesResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, meeting, outputLanguage: "es" }),
    signal,
  });
}
export function downloadMinutePdf(minute: Minute, signal: AbortSignal) {
  return requestPdf("/api/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(minute),
    signal,
    timeoutMs: 60_000,
  });
}
