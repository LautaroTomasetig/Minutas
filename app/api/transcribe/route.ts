import { audioTranscribeRequestSchema } from "@/lib/schemas/audioUpload";
import {
  audioPath,
  deleteAudio,
  readAudioJson,
  readPrivateAudio,
} from "@/lib/server/audioBlob";
import { errorResponse, withTimeout } from "@/lib/server/errors";
import { transcribe, validateAudio } from "@/lib/server/transcribe";

export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  let pathname: string | undefined;
  let cleaned: boolean | undefined;
  let stage = "reference";
  const started = performance.now();
  let response: Response;
  try {
    const result = await withTimeout(
      request.signal,
      150_000,
      async (signal) => {
        const input = audioTranscribeRequestSchema.parse(
          await readAudioJson(request, signal),
        );
        pathname = audioPath(input.audioRef);
        if (input.discard) return { success: true as const, discarded: true };
        stage = "blob_read";
        const file = await readPrivateAudio(pathname, signal);
        signal.throwIfAborted();
        await validateAudio(file);
        stage = "gemini";
        return transcribe(file, signal);
      },
    );
    response = Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    response = errorResponse(error);
  } finally {
    // Outside the timeout race: also runs when a provider ignores cancellation.
    // Gemini receives a buffered File, so deleting Blob cannot disrupt its upload.
    if (pathname) cleaned = await deleteAudio(pathname);
    console.info("[audio] transcribe", {
      stage,
      durationMs: Math.round(performance.now() - started),
      blobDeleted: cleaned ?? null,
    });
  }
  response.headers.set(
    "Server-Timing",
    `transcribe;dur=${Math.round(performance.now() - started)}`,
  );
  if (cleaned !== undefined)
    response.headers.set("X-Audio-Blob-Deleted", String(cleaned));
  return response;
}
