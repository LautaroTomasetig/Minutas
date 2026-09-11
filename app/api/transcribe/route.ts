import { MAX_AUDIO_BYTES } from "@/lib/audio";
import { readBoundedBody } from "@/lib/server/request";
import { errorResponse, ServiceError, withTimeout } from "@/lib/server/errors";
import { transcribe, validateAudio } from "@/lib/server/transcribe";

export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const result = await withTimeout(
      request.signal,
      150_000,
      async (signal) => {
        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.startsWith("multipart/form-data"))
          throw new ServiceError(
            "INVALID_CONTENT_TYPE",
            "Enviá el audio mediante un formulario de archivo.",
            415,
          );
        const bytes = await readBoundedBody(
          request,
          MAX_AUDIO_BYTES + 65_536,
          signal,
        );
        let form: FormData;
        try {
          form = await new Response(bytes, {
            headers: { "Content-Type": contentType },
          }).formData();
        } catch {
          throw new ServiceError(
            "INVALID_FORM",
            "No pudimos leer el archivo de audio enviado.",
          );
        }
        return transcribe(await validateAudio(form.get("audio")), signal);
      },
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
