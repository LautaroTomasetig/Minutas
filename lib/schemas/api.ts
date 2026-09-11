import { z } from "zod";
export const MAX_TRANSCRIPT_CHARACTERS = 120_000;
export const transcriptSchema = z
  .string()
  .trim()
  .min(1, "La transcripción está vacía.")
  .max(MAX_TRANSCRIPT_CHARACTERS);
export const transcribeResponseSchema = z.object({
  success: z.literal(true),
  transcript: transcriptSchema,
  detectedLanguage: z.string().min(2).max(80),
});
export const translateRequestSchema = z.object({
  transcript: transcriptSchema,
});
export const translateResponseSchema = z.object({
  success: z.literal(true),
  translatedTranscript: transcriptSchema,
});
export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});
export type Transcription = z.infer<typeof transcribeResponseSchema>;
