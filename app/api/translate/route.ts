import { translateRequestSchema } from "@/lib/schemas/api";
import { readJson } from "@/lib/server/request";
import { errorResponse, withTimeout } from "@/lib/server/errors";
import { translate } from "@/lib/server/translate";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    const translatedTranscript = await withTimeout(
      request.signal,
      100_000,
      async (signal) => {
        const { transcript } = translateRequestSchema.parse(
          await readJson(request, signal),
        );
        return translate(transcript, signal);
      },
    );
    return Response.json(
      { success: true, translatedTranscript },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
