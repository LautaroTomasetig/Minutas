import { z } from "zod";
import { MAX_AUDIO_BYTES } from "@/lib/audio";

export const audioMimeSchema = z.enum([
  "audio/webm",
  "video/webm",
  "audio/mp4",
  "video/mp4",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
]);
export const audioUploadSchema = z
  .object({
    mimeType: audioMimeSchema,
    size: z.number().int().positive().max(MAX_AUDIO_BYTES),
  })
  .strict();
// A per-file capability, never a URL or a user-selected storage pathname.
export const audioRefSchema = z
  .object({
    key: z.string().regex(/^[a-f0-9]{64}$/),
    extension: z.enum(["webm", "m4a", "mp3", "wav"]),
  })
  .strict();
export type AudioRef = z.infer<typeof audioRefSchema>;
export const audioUploadResponseSchema = z.object({
  success: z.literal(true),
  audioRef: audioRefSchema,
  uploadUrl: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "vercel.com" &&
      url.pathname.startsWith("/api/blob/")
    );
  }),
});
export const audioTranscribeRequestSchema = z
  .object({
    audioRef: audioRefSchema,
    discard: z.boolean().optional(),
  })
  .strict();
