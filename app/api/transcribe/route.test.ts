// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
vi.mock("server-only", () => ({}));
const provider = vi.hoisted(() => ({
  create: vi.fn(),
  upload: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));
const storage = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", async (original) => ({
  ...(await original<typeof import("@vercel/blob")>()),
  ...storage,
}));
vi.mock("@/lib/server/ai", async (original) => ({
  ...(await original<typeof import("@/lib/server/ai")>()),
  aiClient: () => ({
    interactions: { create: provider.create },
    files: {
      upload: provider.upload,
      get: provider.get,
      delete: provider.delete,
    },
  }),
}));
import { POST } from "./route";
import { audioPath } from "@/lib/server/audioBlob";
import { transcribe } from "@/lib/server/transcribe";
import { withTimeout } from "@/lib/server/errors";

const audioRef = { key: "a".repeat(64), extension: "webm" };
const webm = () =>
  new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0])], {
    type: "audio/webm",
  });
const req = (body: unknown = { audioRef }) =>
  new Request("http://localhost/api/transcribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
function stored(audio = webm(), declaredSize = audio.size) {
  storage.get.mockImplementation(async () => ({
    statusCode: 200,
    stream: audio.stream(),
    blob: { contentType: audio.type, size: declaredSize },
  }));
}
beforeEach(() => {
  Object.values(provider).forEach((mock) => mock.mockReset());
  Object.values(storage).forEach((mock) => mock.mockReset());
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  stored();
  storage.del.mockResolvedValue(undefined);
  provider.upload.mockResolvedValue({
    name: "files/test",
    uri: "https://example.test/audio",
    state: "ACTIVE",
  });
  provider.delete.mockResolvedValue({});
  provider.create.mockResolvedValue({
    status: "completed",
    output_text: " Revisamos el proyecto. ",
  });
});
afterEach(() => vi.useRealTimers());
describe("reference transcription", () => {
  it("reads a private Blob and passes the same audio to Gemini Transcribe", async () => {
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      transcript: "Revisamos el proyecto.",
      detectedLanguage: "und",
    });
    expect(storage.get).toHaveBeenCalledWith(audioPath(audioRef as never), {
      access: "private",
      useCache: false,
      abortSignal: expect.any(AbortSignal),
    });
    expect(await provider.upload.mock.calls[0][0].file.arrayBuffer()).toEqual(
      await webm().arrayBuffer(),
    );
    expect(provider.create).toHaveBeenCalledWith(
      {
        model: "gemini-3.5-transcribe",
        store: false,
        input: [
          {
            type: "audio",
            uri: "https://example.test/audio",
            mime_type: "audio/webm",
          },
        ],
        generation_config: {
          transcription_config: { language_codes: [], mode: "verbatim" },
        },
      },
      expect.objectContaining({ timeout: 150000, maxRetries: 0 }),
    );
    expect(storage.del).toHaveBeenCalledOnce();
    expect(provider.delete).toHaveBeenCalledOnce();
    expect(response.headers.get("x-audio-blob-deleted")).toBe("true");
  });
  it("rejects multipart instead of reading audio bytes", async () => {
    const form = new FormData();
    form.append("audio", webm());
    expect(
      (
        await POST(
          new Request("http://localhost/api/transcribe", {
            method: "POST",
            body: form,
          }),
        )
      ).status,
    ).toBe(415);
    expect(storage.get).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { audioRef: { url: "http://127.0.0.1/private" } },
    { audioRef: { key: "../etc/passwd", extension: "webm" } },
    { audioRef: { ...audioRef, extension: "html" } },
    { audioRef, pathname: "other-file" },
  ])(
    "rejects invalid references without accessing or deleting storage",
    async (body) => {
      expect((await POST(req(body))).status).toBe(400);
      expect(storage.get).not.toHaveBeenCalled();
      expect(storage.del).not.toHaveBeenCalled();
    },
  );
  it("limits actual JSON bytes", async () => {
    expect((await POST(req({ padding: "a".repeat(5000) }))).status).toBe(413);
    expect(storage.get).not.toHaveBeenCalled();
  });
  it("returns 404 for missing Blob and still attempts cleanup", async () => {
    storage.get.mockResolvedValue(null);
    expect((await POST(req())).status).toBe(404);
    expect(provider.upload).not.toHaveBeenCalled();
    expect(storage.del).toHaveBeenCalledOnce();
  });
  it("sanitizes storage errors and attempts cleanup", async () => {
    storage.get.mockRejectedValue(new Error("private-detail"));
    const response = await POST(req());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-detail");
    expect(storage.del).toHaveBeenCalledOnce();
  });
  it.each([
    new Blob(["invalid"], { type: "audio/webm" }),
    new Blob(["invalid"], { type: "text/html" }),
  ])("checks actual content/MIME and deletes invalid audio", async (audio) => {
    stored(audio);
    expect((await POST(req())).status).toBe(422);
    expect(provider.upload).not.toHaveBeenCalled();
    expect(storage.del).toHaveBeenCalledOnce();
  });
  it("rejects oversized declared Blob", async () => {
    stored(webm(), 24000001);
    expect((await POST(req())).status).toBe(422);
    expect(provider.upload).not.toHaveBeenCalled();
  });
  it("bounds downloaded bytes even if storage metadata understates size", async () => {
    stored(new Blob([new Uint8Array(24_000_001)], { type: "audio/webm" }), 100);
    expect((await POST(req())).status).toBe(413);
    expect(storage.del).toHaveBeenCalledOnce();
  });
  it("normalizes MP4 MIME without converting bytes", async () => {
    const audio = new Blob([new Uint8Array([0, 0, 0, 16]), "ftypM4A "], {
      type: "audio/mp4",
    });
    stored(audio);
    expect((await POST(req())).status).toBe(200);
    expect(provider.upload.mock.calls[0][0].config.mimeType).toBe("audio/m4a");
    expect(await provider.upload.mock.calls[0][0].file.arrayBuffer()).toEqual(
      await audio.arrayBuffer(),
    );
  });
  it("cleans both stores on Gemini failure, preserving the safe error", async () => {
    provider.create.mockRejectedValue(
      new ApiError({ status: 429, message: "private-detail" }),
    );
    const response = await POST(req());
    expect(response.status).toBe(429);
    expect(await response.text()).not.toContain("private-detail");
    expect(storage.del).toHaveBeenCalledOnce();
    expect(provider.delete).toHaveBeenCalledOnce();
  });
  it.each([
    { status: "incomplete", output_text: "fragment" },
    { status: "completed", output_text: 12 },
    { status: "completed" },
  ])("rejects incomplete or malformed model output", async (result) => {
    provider.create.mockResolvedValue(result);
    expect((await POST(req())).status).toBe(502);
    expect(storage.del).toHaveBeenCalledOnce();
  });
  it("handles audio without speech", async () => {
    provider.create.mockResolvedValue({
      status: "completed",
      output_text: " ",
    });
    expect((await POST(req())).status).toBe(422);
    expect(storage.del).toHaveBeenCalledOnce();
  });
  it("keeps successful transcription if Blob deletion fails, with a safe log", async () => {
    storage.del.mockRejectedValue(new Error("private-detail"));
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(response.headers.get("x-audio-blob-deleted")).toBe("false");
    expect(console.error).toHaveBeenCalledWith("[audio] BLOB_CLEANUP_FAILED");
    expect(await response.text()).not.toContain("private-detail");
  });
  it("keeps successful transcription if Google deletion fails", async () => {
    provider.delete.mockRejectedValue(new Error("private-detail"));
    expect((await POST(req())).status).toBe(200);
    expect(storage.del).toHaveBeenCalledOnce();
  });
  it("discards uploaded audio without Gemini on cancellation", async () => {
    expect((await POST(req({ audioRef, discard: true }))).status).toBe(200);
    expect(storage.del).toHaveBeenCalledOnce();
    expect(storage.get).not.toHaveBeenCalled();
    expect(provider.upload).not.toHaveBeenCalled();
  });
  it("times out at 150 seconds and deletes Blob even if Gemini ignores abort", async () => {
    vi.useFakeTimers();
    provider.create.mockReturnValue(new Promise(() => {}));
    const pending = POST(req());
    await vi.advanceTimersByTimeAsync(150000);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ error: { code: "TIMEOUT" } });
    expect(storage.del).toHaveBeenCalledOnce();
    expect(storage.del.mock.calls[0][1].abortSignal.aborted).toBe(false);
  });
  it("bounds cleanup to three seconds even if the SDK ignores cancellation", async () => {
    vi.useFakeTimers();
    storage.del.mockReturnValue(new Promise(() => {}));
    const pending = POST(req());
    await vi.advanceTimersByTimeAsync(3001);
    expect((await pending).status).toBe(200);
    expect(console.error).toHaveBeenCalledWith("[audio] BLOB_CLEANUP_FAILED");
  });
  it("cleans a late Google upload without starting the model after timeout", async () => {
    let finish!: (value: unknown) => void;
    provider.upload.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const task = withTimeout(new AbortController().signal, 10, (signal) =>
      transcribe(
        new File([webm()], "test.webm", { type: "audio/webm" }),
        signal,
      ),
    );
    await expect(task).rejects.toMatchObject({ code: "TIMEOUT" });
    finish({
      name: "files/test",
      uri: "https://example.test/audio",
      state: "ACTIVE",
    });
    await vi.waitFor(() => expect(provider.delete).toHaveBeenCalledOnce());
    expect(provider.create).not.toHaveBeenCalled();
  });
  it("waits for an ACTIVE Google file", async () => {
    vi.useFakeTimers();
    provider.upload.mockResolvedValue({
      name: "files/test",
      state: "PROCESSING",
    });
    provider.get.mockResolvedValue({
      name: "files/test",
      uri: "https://example.test/audio",
      state: "ACTIVE",
    });
    const pending = POST(req());
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).status).toBe(200);
    expect(provider.get).toHaveBeenCalledOnce();
  });
});
