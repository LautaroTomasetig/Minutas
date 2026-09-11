import "server-only";
import { ServiceError } from "./errors";

// Bound the actual bytes, including chunked requests without Content-Length.
export async function readBoundedBody(
  request: Request,
  maxBytes: number,
  signal = request.signal,
) {
  const length = request.headers.get("content-length");
  if (length && Number(length) > maxBytes)
    throw new ServiceError(
      "PAYLOAD_TOO_LARGE",
      "El archivo o contenido supera el tamaño permitido.",
      413,
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new ServiceError(
      "EMPTY_BODY",
      "No recibimos contenido para procesar.",
    );
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted)
        throw new ServiceError("CANCELLED", "La solicitud fue cancelada.", 408);
      const { value, done } = await reader.read();
      if (signal.aborted)
        throw new ServiceError("CANCELLED", "La solicitud fue cancelada.", 408);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ServiceError(
          "PAYLOAD_TOO_LARGE",
          "El archivo o contenido supera el tamaño permitido.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export async function readJson(request: Request, signal = request.signal) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ServiceError(
      "INVALID_CONTENT_TYPE",
      "Enviá el contenido en formato JSON.",
      415,
    );
  return JSON.parse(
    new TextDecoder().decode(await readBoundedBody(request, 1_000_000, signal)),
  ) as unknown;
}
