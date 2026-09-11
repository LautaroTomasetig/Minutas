import { request, requestPdf } from "./client";
import { audioExtension, MAX_AUDIO_BYTES } from "@/lib/audio";
import { ApiError } from "./client";
import {
  transcribeResponseSchema,
  translateResponseSchema,
} from "@/lib/schemas/api";
import { minutesResponseSchema } from "@/lib/schemas/minute";
import type { Meeting } from "@/lib/schemas/meeting";
import type { Minute } from "@/lib/schemas/minute";

export function transcribeAudio(audio: Blob, signal: AbortSignal) {
  if (!audio.size || audio.size > MAX_AUDIO_BYTES)
    throw new ApiError(
      "INVALID_AUDIO",
      "El audio debe tener contenido y pesar hasta 24 MB. Podés descargarlo para conservarlo.",
    );
  const body = new FormData();
  body.append("audio", audio, `reunion.${audioExtension(audio.type)}`);
  return request("/api/transcribe", transcribeResponseSchema, {
    method: "POST",
    body,
    signal,
  });
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
