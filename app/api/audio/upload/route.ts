import { audioUploadSchema } from "@/lib/schemas/audioUpload";
import {
  authorizeAudioUpload,
  readAudioJson,
  requireSameOrigin,
} from "@/lib/server/audioBlob";
import { errorResponse, withTimeout } from "@/lib/server/errors";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const result = await withTimeout(
      request.signal,
      150_000,
      async (signal) => {
        const { mimeType, size } = audioUploadSchema.parse(
          await readAudioJson(request, signal),
        );
        return authorizeAudioUpload(mimeType, size, signal);
      },
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
