// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readBoundedBody } from "./request";
import { withTimeout } from "./errors";

describe("bounded requests", () => {
  it("limita también cuerpos sin Content-Length", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "too long",
    });
    await expect(readBoundedBody(request, 3)).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
  });
  it("interrumpe la lectura si la subida queda detenida", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const request = new Request("http://localhost", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    await expect(
      withTimeout(request.signal, 20, (signal) =>
        readBoundedBody(request, 100, signal),
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(cancel).toHaveBeenCalled();
  });
});
