import { z } from "zod";
import { apiErrorSchema } from "@/lib/schemas/api";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
type Options = RequestInit & { timeoutMs?: number };
async function performRequest<T>(
  path: string,
  options: Options,
  parse: (response: Response) => Promise<T>,
): Promise<T> {
  const { timeoutMs = 180_000, signal: parentSignal, ...init } = options;
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (parentSignal?.aborted) cancel();
  parentSignal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    if (controller.signal.aborted)
      throw new ApiError("CANCELLED", "Procesamiento cancelado.");
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        /* HTTP failures can contain HTML. */
      }
      const failure = apiErrorSchema.safeParse(body);
      if (failure.success)
        throw new ApiError(
          failure.data.error.code,
          failure.data.error.message,
          response.status,
        );
      throw new ApiError(
        "HTTP_ERROR",
        `El servicio no pudo completar la solicitud (${response.status}). Volvé a intentar.`,
        response.status,
      );
    }
    return await parse(response);
  } catch (error) {
    if (timedOut)
      throw new ApiError(
        "TIMEOUT",
        "El procesamiento tardó demasiado. Tus datos siguen disponibles; podés reintentar.",
      );
    if (controller.signal.aborted)
      throw new ApiError(
        "CANCELLED",
        "Procesamiento cancelado. Tus datos siguen disponibles.",
      );
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "NETWORK_ERROR",
      "No pudimos conectarnos. Revisá tu conexión y volvé a intentar.",
    );
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", cancel);
  }
}
export function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: Options = {},
): Promise<T> {
  return performRequest(path, options, async (response) => {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiError(
        "INVALID_RESPONSE",
        "El servicio devolvió una respuesta que no pudimos interpretar.",
      );
    }
    const failure = apiErrorSchema.safeParse(body);
    if (failure.success)
      throw new ApiError(
        failure.data.error.code,
        failure.data.error.message,
        response.status,
      );
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new ApiError(
        "INVALID_RESPONSE",
        "La respuesta está incompleta. Tus datos siguen disponibles para reintentar.",
      );
    return parsed.data;
  });
}
export function requestPdf(path: string, options: Options): Promise<Blob> {
  return performRequest(path, options, async (response) => {
    if (!response.headers.get("content-type")?.includes("application/pdf"))
      throw new ApiError(
        "INVALID_RESPONSE",
        "El servicio no devolvió un PDF válido.",
      );
    const blob = await response.blob();
    if (!blob.size || (await blob.slice(0, 5).text()) !== "%PDF-")
      throw new ApiError(
        "INVALID_RESPONSE",
        "El PDF recibido está vacío o incompleto.",
      );
    return blob;
  });
}
