// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, GoogleGenAI } from "@google/genai";
vi.mock("server-only", () => ({}));
import { errorResponse, withTimeout } from "./errors";
afterEach(() => vi.unstubAllGlobals());

describe("errores Gemini", () => {
  it.each([
    [429, "RESOURCE_EXHAUSTED", 429, "PROVIDER_LIMIT"],
    [401, "UNAUTHENTICATED", 503, "AI_UNAVAILABLE"],
    [403, "PERMISSION_DENIED", 503, "AI_UNAVAILABLE"],
    [400, "API_KEY_INVALID", 503, "AI_UNAVAILABLE"],
    [400, "API key expired", 503, "AI_UNAVAILABLE"],
    [404, "NOT_FOUND", 503, "AI_UNAVAILABLE"],
    [400, "INVALID_ARGUMENT", 422, "PROVIDER_REJECTED"],
    [500, "INTERNAL", 502, "PROVIDER_ERROR"],
    [503, "UNAVAILABLE", 502, "PROVIDER_ERROR"],
    [504, "DEADLINE_EXCEEDED", 504, "TIMEOUT"],
  ])(
    "traduce HTTP %s / %s sin filtrar detalles",
    async (status, reason, expectedStatus, code) => {
      const response = errorResponse(
        new ApiError({
          status: Number(status),
          message: String(reason) + " private-provider-detail",
        }),
      );
      expect(response.status).toBe(expectedStatus);
      const body = await response.json();
      expect(body.error.code).toBe(code);
      expect(JSON.stringify(body)).not.toContain("private-provider-detail");
    },
  );
  it("mapea la clase real de error de Interactions usando transporte simulado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 429,
              status: "RESOURCE_EXHAUSTED",
              message: "private-provider-detail",
            },
          },
          { status: 429 },
        ),
      ),
    );
    const client = new GoogleGenAI({ apiKey: "test-only-placeholder" });
    let failure: unknown;
    try {
      await client.interactions.create(
        { model: "gemini-3.5-flash-lite", input: "test", store: false },
        { maxRetries: 0 },
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    const response = errorResponse(failure);
    expect(response.status).toBe(429);
    expect(await response.text()).not.toContain("private-provider-detail");
  });
  it("distingue timeout de red", () => {
    expect(
      errorResponse(
        Object.assign(new Error("private-provider-detail"), {
          name: "APIConnectionTimeoutError",
        }),
      ).status,
    ).toBe(504);
    expect(
      errorResponse(
        Object.assign(new Error("private-provider-detail"), {
          name: "APIConnectionError",
        }),
      ).status,
    ).toBe(502);
  });
  it("devuelve timeout aunque el SDK no coopere", async () => {
    await expect(
      withTimeout(
        new AbortController().signal,
        20,
        () => new Promise(() => {}),
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
  });
  it("cancela sin esperar al proveedor y no inicia tareas ya canceladas", async () => {
    const controller = new AbortController();
    const task = vi.fn(() => new Promise(() => {}));
    const operation = withTimeout(controller.signal, 1000, task);
    controller.abort();
    await expect(operation).rejects.toMatchObject({
      code: "CANCELLED",
      status: 408,
    });
    const notStarted = vi.fn();
    await expect(
      withTimeout(controller.signal, 1000, notStarted),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(notStarted).not.toHaveBeenCalled();
  });
});
