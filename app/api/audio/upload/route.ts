import { handleUploadPresigned } from "@vercel/blob/client";
import {
  audioUploadSchema,
  audioUploadEventSchema,
  audioUploadPayloadSchema,
} from "@/lib/schemas/audioUpload";
import {
  prepareAudioUpload,
  authorizeAudioUpload,
  readAudioJson,
  requireSameOrigin,
} from "@/lib/server/audioBlob";
import { errorResponse, ServiceError, withTimeout } from "@/lib/server/errors";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const result = await withTimeout(
      request.signal,
      150_000,
      async (signal) => {
        const input = await readAudioJson(request, signal);
        if (input && typeof input === "object" && "type" in input) {
          const body = audioUploadEventSchema.parse(input);
          const payload = audioUploadPayloadSchema.parse(
            JSON.parse(body.payload.clientPayload),
          );
          // No completion callback is registered: transcription owns cleanup.
          try {
            return await handleUploadPresigned({
              body,
              request,
              getSignedToken: async (pathname) => {
                return authorizeAudioUpload(pathname, payload, signal);
              },
            });
          } catch (error) {
            signal.throwIfAborted();
            if (error instanceof ServiceError) throw error;
            // Only recognize fixed SDK configuration errors; never expose provider bodies.
            const configurationError =
              error instanceof Error
                ? error.message === "Vercel Blob: Missing webhook public key"
                  ? {
                      reason: "MISSING_WEBHOOK_PUBLIC_KEY",
                      message:
                        "Falta BLOB_WEBHOOK_PUBLIC_KEY en el servidor. Sincronizá la conexión de Vercel Blob para este entorno y reiniciá la aplicación.",
                    }
                  : error.message ===
                      "Vercel Blob: No blob credentials found. Pass a `token` option, set `BLOB_READ_WRITE_TOKEN`, or use `oidcToken` (or `VERCEL_OIDC_TOKEN`) with `storeId` or `BLOB_STORE_ID`."
                    ? {
                        reason: "MISSING_BLOB_CREDENTIALS",
                        message:
                          "Falta la autenticación de Vercel Blob en el servidor. Para la conexión OIDC, sincronizá BLOB_STORE_ID y VERCEL_OIDC_TOKEN para este entorno y reiniciá la aplicación.",
                      }
                    : null
                : null;
            if (configurationError) {
              console.error(
                "[audio] BLOB_NOT_CONFIGURED",
                configurationError.reason,
              );
              throw new ServiceError(
                "BLOB_NOT_CONFIGURED",
                configurationError.message,
                503,
              );
            }
            console.error("[audio] BLOB_UPLOAD_AUTHORIZATION_FAILED");
            throw new ServiceError(
              "BLOB_UNAVAILABLE",
              "No pudimos autorizar la subida de audio. Revisá la conexión del Blob Store.",
              503,
            );
          }
        }
        const { mimeType } = audioUploadSchema.parse(input);
        return prepareAudioUpload(mimeType);
      },
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
