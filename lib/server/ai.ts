import "server-only";
import { GoogleGenAI } from "@google/genai";
import { ServiceError } from "./errors";

export function aiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim())
    throw new ServiceError(
      "AI_NOT_CONFIGURED",
      "El servicio de IA todavía no está configurado. Podés conservar el audio y volver a intentar cuando esté disponible.",
      503,
    );
  return new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 150_000, retryOptions: { attempts: 1 } },
  });
}
export const minutesModel = () => "gemini-3.5-flash-lite";

// Invalid provider JSON is a 502 handled by each operation, not invalid user input.
export function readStructuredOutput(response: unknown): unknown {
  if (
    !response ||
    typeof response !== "object" ||
    !("status" in response) ||
    response.status !== "completed" ||
    !("output_text" in response) ||
    typeof response.output_text !== "string"
  )
    return undefined;
  try {
    return JSON.parse(response.output_text);
  } catch {
    return undefined;
  }
}
