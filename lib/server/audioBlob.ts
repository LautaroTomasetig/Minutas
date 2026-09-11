import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { BlobNotFoundError, del, get, issueSignedToken } from "@vercel/blob";
import { MAX_AUDIO_BYTES } from "@/lib/audio";
import { audioMimeSchema, type AudioRef } from "@/lib/schemas/audioUpload";
import { ServiceError } from "./errors";
import { readBoundedBody } from "./request";

export const AUDIO_JSON_LIMIT = 4096;
export async function readAudioJson(request: Request, signal = request.signal) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new ServiceError(
      "INVALID_CONTENT_TYPE",
      "Enviá la referencia en formato JSON.",
      415,
    );
  return JSON.parse(
    new TextDecoder().decode(
      await readBoundedBody(request, AUDIO_JSON_LIMIT, signal),
    ),
  ) as unknown;
}
export function requireSameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new ServiceError(
      "INVALID_ORIGIN",
      "La solicitud debe iniciarse desde esta aplicación.",
      403,
    );
}
export function audioPath(ref: AudioRef) {
  // Knowing the storage URL alone cannot authorize transcription/deletion:
  // a caller must know the random 256-bit preimage supplied at authorization.
  const digest = createHash("sha256").update(ref.key).digest("hex");
  return `meeting-audio/${digest}.${ref.extension}`;
}
export function prepareAudioUpload(mimeType: string) {
  const extension: AudioRef["extension"] = mimeType.includes("webm")
    ? "webm"
    : mimeType.includes("mp4") || mimeType.includes("m4a")
      ? "m4a"
      : mimeType.includes("wav")
        ? "wav"
        : "mp3";
  const audioRef: AudioRef = {
    key: randomBytes(32).toString("hex"),
    extension,
  };
  return { success: true as const, audioRef, pathname: audioPath(audioRef) };
}
export async function authorizeAudioUpload(
  pathname: string,
  payload: { audioRef: AudioRef; mimeType: string; size: number },
  signal: AbortSignal,
) {
  const { audioRef, mimeType, size } = payload;
  if (pathname !== audioPath(audioRef))
    throw new ServiceError(
      "INVALID_AUDIO_REFERENCE",
      "La referencia no corresponde al audio autorizado.",
      400,
    );
  const validUntil = Date.now() + 3 * 60_000;
  // SDK resolves the injected OIDC/store configuration; signing stays in the helper.
  const token = await issueSignedToken({
    pathname,
    operations: ["put"],
    allowedContentTypes: [mimeType],
    maximumSizeInBytes: size,
    validUntil,
    abortSignal: signal,
  });
  return {
    token,
    urlOptions: {
      validUntil,
      allowedContentTypes: [mimeType],
      maximumSizeInBytes: size,
      allowOverwrite: false,
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
    },
  };
}
export async function readPrivateAudio(pathname: string, signal: AbortSignal) {
  let result;
  try {
    result = await get(pathname, {
      access: "private",
      useCache: false,
      abortSignal: signal,
    });
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof BlobNotFoundError)
      throw new ServiceError(
        "AUDIO_NOT_FOUND",
        "El audio temporal ya no está disponible. Volvé a subirlo.",
        404,
      );
    console.error("[audio] BLOB_READ_FAILED");
    throw new ServiceError(
      "BLOB_UNAVAILABLE",
      "No pudimos acceder al audio temporal.",
      503,
    );
  }
  if (!result)
    throw new ServiceError(
      "AUDIO_NOT_FOUND",
      "El audio temporal ya no está disponible. Volvé a subirlo.",
      404,
    );
  if (result.statusCode !== 200)
    throw new ServiceError(
      "BLOB_UNAVAILABLE",
      "No pudimos leer el audio temporal.",
      502,
    );
  const mime = result.blob.contentType.split(";")[0].toLowerCase();
  if (
    !audioMimeSchema.safeParse(mime).success ||
    result.blob.size > MAX_AUDIO_BYTES ||
    result.blob.size <= 0
  ) {
    await result.stream.cancel().catch(() => {});
    throw new ServiceError(
      "INVALID_AUDIO",
      "El audio temporal tiene un formato o tamaño inválido.",
      422,
    );
  }
  // Bound the streamed bytes as well as declared metadata.
  const incoming = new Request("http://audio.internal", {
    method: "POST",
    body: result.stream,
    duplex: "half",
  } as RequestInit);
  const bytes = await readBoundedBody(incoming, MAX_AUDIO_BYTES, signal);
  return new File([bytes], pathname.split("/").pop()!, { type: mime });
}
export async function deleteAudio(pathname: string) {
  try {
    const signal = AbortSignal.timeout(3000);
    await Promise.race([
      del(pathname, { abortSignal: signal }),
      new Promise<never>((_, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new Error("cleanup deadline")),
          { once: true },
        );
      }),
    ]);
    return true;
  } catch {
    // Fixed technical code only: no provider body, URL, capability or credentials.
    console.error("[audio] BLOB_CLEANUP_FAILED");
    return false;
  }
}
