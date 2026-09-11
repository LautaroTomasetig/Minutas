import { minuteSchema } from "@/lib/schemas/minute";
import { readJson } from "@/lib/server/request";
import { errorResponse } from "@/lib/server/errors";
import { exportMinute } from "@/lib/pdf/exportMinute";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const minute = minuteSchema.parse(await readJson(request));
    const buffer = await exportMinute(minute);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="minuta.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
