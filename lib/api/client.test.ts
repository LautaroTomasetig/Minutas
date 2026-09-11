import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { request } from "./client";
const schema = z.object({ success: z.literal(true), value: z.string() });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("HTTP client", () => {
  it("valida una respuesta exitosa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ success: true, value: "ok" })),
    );
    expect(await request("/api/test", schema)).toEqual({
      success: true,
      value: "ok",
    });
  });
  it("maneja HTTP 500 con HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("<html>Error</html>", { status: 500 })),
    );
    await expect(request("/api/test", schema)).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 500,
    });
  });
  it("rechaza un JSON incompatible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ success: true })),
    );
    await expect(request("/api/test", schema)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("aborta al vencer el timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          ),
      ),
    );
    const assertion = expect(
      request("/api/test", schema, { timeoutMs: 50 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
  });
  it("distingue cancelación manual y error de red", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(request("/api/test", schema)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      request("/api/test", schema, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });
});
