// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ uploadPresigned: vi.fn() }));
vi.mock("@vercel/blob/client", () => sdk);
import { transcribeAudio } from "./meetings";
const audioRef = { key: "a".repeat(64), extension: "webm" };
const pathname = "meeting-audio/" + "b".repeat(64) + ".webm";
const prepared = () => Response.json({ success: true, audioRef, pathname });
beforeEach(() => {
  sdk.uploadPresigned.mockReset().mockResolvedValue({ pathname });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("delegates a 5.5 MB Blob to the SDK and sends only a reference to transcribe", async () => {
  const audio = new Blob([new Uint8Array(5500000)], {
    type: "audio/webm;codecs=opus",
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(prepared())
    .mockResolvedValueOnce(
      Response.json({
        success: true,
        transcript: "Texto del contrato.",
        detectedLanguage: "und",
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const stage = vi.fn();
  expect(
    (await transcribeAudio(audio, new AbortController().signal, stage))
      .transcript,
  ).toBeTruthy();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    mimeType: "audio/webm",
    size: 5500000,
  });
  expect(sdk.uploadPresigned).toHaveBeenCalledWith(pathname, audio, {
    access: "private",
    handleUploadUrl: "/api/audio/upload",
    clientPayload: JSON.stringify({
      audioRef,
      mimeType: "audio/webm",
      size: 5500000,
    }),
    contentType: "audio/webm",
    multipart: false,
    abortSignal: expect.any(AbortSignal),
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.every(([, init]) => init.method === "POST")).toBe(
    true,
  );
  expect(fetchMock.mock.calls[1][0]).toBe("/api/transcribe");
  expect(Buffer.byteLength(fetchMock.mock.calls[1][1].body)).toBe(106);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ audioRef });
  expect(stage.mock.calls).toEqual([["uploading"], ["transcribing"]]);
});
it("preserves Gemini errors and attempts discard", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(prepared())
    .mockResolvedValueOnce(
      Response.json(
        {
          success: false,
          error: { code: "PROVIDER_LIMIT", message: "Cuota agotada." },
        },
        { status: 429 },
      ),
    )
    .mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    transcribeAudio(
      new Blob(["audio"], { type: "audio/webm" }),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "PROVIDER_LIMIT" });
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
    audioRef,
    discard: true,
  });
});
it("rejects a mismatched SDK result before transcription", async () => {
  sdk.uploadPresigned.mockResolvedValue({ pathname: "other" });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(prepared())
    .mockResolvedValueOnce(Response.json({ success: true }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    transcribeAudio(
      new Blob(["audio"], { type: "audio/webm" }),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "INVALID_UPLOAD_RESPONSE" });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    audioRef,
    discard: true,
  });
});
it("sanitizes SDK errors without leaking signed URLs", async () => {
  sdk.uploadPresigned.mockRejectedValue(new Error("private-provider-detail"));
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(prepared())
    .mockResolvedValueOnce(Response.json({ success: true }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    transcribeAudio(
      new Blob(["audio"], { type: "audio/webm" }),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "UPLOAD_FAILED" });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).discard).toBe(true);
});
it("preserves the 180 second transcription timeout", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(prepared())
    .mockImplementationOnce(
      (_url, options) =>
        new Promise((_, reject) =>
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          ),
        ),
    )
    .mockResolvedValueOnce(Response.json({ success: true, discarded: true }));
  vi.stubGlobal("fetch", fetchMock);
  const task = transcribeAudio(
    new Blob(["audio"], { type: "audio/webm" }),
    new AbortController().signal,
  );
  const rejected = expect(task).rejects.toMatchObject({ code: "TIMEOUT" });
  await vi.advanceTimersByTimeAsync(179999);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
});

it("cancels even when SDK authorization does not settle, without starting transcription", async () => {
  sdk.uploadPresigned.mockReturnValue(new Promise(() => {}));
  const controller = new AbortController();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(prepared())
    .mockResolvedValueOnce(Response.json({ success: true }));
  vi.stubGlobal("fetch", fetchMock);
  const task = transcribeAudio(
    new Blob(["audio"], { type: "audio/webm" }),
    controller.signal,
  );
  const rejection = expect(task).rejects.toMatchObject({ code: "CANCELLED" });
  await vi.waitFor(() => expect(sdk.uploadPresigned).toHaveBeenCalledOnce());
  controller.abort();
  await rejection;
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    audioRef,
    discard: true,
  });
});
