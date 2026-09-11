import { minutesRequestSchema } from "@/lib/schemas/minute";
import { readJson } from "@/lib/server/request";
import { errorResponse, withTimeout } from "@/lib/server/errors";
import { generateMinutes } from "@/lib/server/generateMinutes";

export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const minutes = await withTimeout(
      request.signal,
      150_000,
      async (signal) => {
        const input = minutesRequestSchema.parse(
          await readJson(request, signal),
        );
        return generateMinutes(input.transcript, input.meeting, signal);
      },
    );
    return Response.json(
      { success: true, minutes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
