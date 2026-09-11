import "server-only";
import { ApiError } from "@google/genai";
import { ZodError } from "zod";

export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
// Files and Interactions expose different SDK error classes. Never return bodies.
function isGeminiError(error: unknown): error is Error & { status?: unknown } {
  return (
    error instanceof ApiError ||
    (error instanceof Error &&
      (("status" in error && typeof error.status === "number") ||
        /^(APIConnectionError|APIConnectionTimeoutError|RequestTimeoutError|ConnectionError|TimeoutError)$/.test(
          error.name,
        ) ||
        (error instanceof TypeError && /fetch failed/i.test(error.message))))
  );
}
export function errorResponse(error: unknown) {
  let failure: ServiceError;
  if (error instanceof ServiceError) failure = error;
  else if (error instanceof ZodError)
    failure = new ServiceError(
      "VALIDATION_ERROR",
      "Revisá los datos enviados. Hay campos vacíos, demasiado largos o inválidos.",
    );
  else if (isGeminiError(error)) {
    const status = typeof error.status === "number" ? error.status : undefined;
    if (status === 429)
      failure = new ServiceError(
        "PROVIDER_LIMIT",
        "El servicio de IA alcanzó su límite de uso. Intentá más tarde o revisá la configuración del servicio.",
        429,
      );
    else if (
      status === 401 ||
      status === 403 ||
      status === 404 ||
      (status === 400 &&
        /API_KEY_INVALID|API_KEY_EXPIRED|API key not valid|API key expired/i.test(
          error.message,
        ))
    )
      failure = new ServiceError(
        "AI_UNAVAILABLE",
        "El servicio de IA no está disponible con la configuración actual.",
        503,
      );
    else if (
      status === 408 ||
      status === 504 ||
      /^(APIConnectionTimeoutError|RequestTimeoutError|TimeoutError)$/.test(
        error.name,
      )
    )
      failure = new ServiceError(
        "TIMEOUT",
        "El servicio tardó demasiado. Podés reintentar con los datos disponibles.",
        504,
      );
    else if (status === 400 || status === 422)
      failure = new ServiceError(
        "PROVIDER_REJECTED",
        "El proveedor no pudo procesar el contenido. Revisá el audio o la transcripción.",
        422,
      );
    else
      failure = new ServiceError(
        "PROVIDER_ERROR",
        "No pudimos completar el procesamiento con el servicio de IA. Volvé a intentar.",
        502,
      );
  } else if (error instanceof SyntaxError)
    failure = new ServiceError(
      "INVALID_JSON",
      "El contenido enviado no es un JSON válido.",
    );
  else
    failure = new ServiceError(
      "INTERNAL_ERROR",
      "Ocurrió un problema al procesar la solicitud. Volvé a intentar.",
      500,
    );
  return Response.json(
    { success: false, error: { code: failure.code, message: failure.message } },
    { status: failure.status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function withTimeout<T>(
  signal: AbortSignal,
  ms: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let expired = false;
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const timeout = setTimeout(() => {
    expired = true;
    controller.abort();
  }, ms);
  let rejectAbort: () => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  try {
    controller.signal.throwIfAborted();
    // Bound the response even if an SDK upload stage ignores its signal.
    return await Promise.race([task(controller.signal), aborted]);
  } catch (error) {
    if (expired)
      throw new ServiceError(
        "TIMEOUT",
        "El servicio tardó demasiado. Podés reintentar con los datos disponibles.",
        504,
      );
    if (signal.aborted)
      throw new ServiceError("CANCELLED", "La solicitud fue cancelada.", 408);
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener("abort", rejectAbort!);
    signal.removeEventListener("abort", cancel);
  }
}
