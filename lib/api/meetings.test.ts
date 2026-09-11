// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { transcribeAudio } from "./meetings";
const audioRef = { key: "a".repeat(64), extension: "webm" };
const uploadUrl = "https://vercel.com/api/blob/?test=1";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("sends a 5.5 MB Blob only to storage and a small JSON reference to transcribe", async () => {
  const audio = new Blob([new Uint8Array(5_500_000)], {
    type: "audio/webm;codecs=opus",
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, audioRef, uploadUrl }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(
      Response.json({
        success: true,
        transcript: "Texto real del contrato.",
        detectedLanguage: "und",
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const stage = vi.fn();
  const result = await transcribeAudio(
    audio,
    new AbortController().signal,
    stage,
  );
  expect(result.transcript).toBeTruthy();
  expect(fetchMock.mock.calls[0][0]).toBe("/api/audio/upload");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    mimeType: "audio/webm",
    size: 5500000,
  });
  const [destination, put] = fetchMock.mock.calls[1];
  expect(destination).toBe(uploadUrl);
  expect(put.method).toBe("PUT");
  expect(put.body).toBe(audio);
  expect(put.credentials).toBe("omit");
  expect(put.headers).toEqual({ "Content-Type": "audio/webm" });
  const [endpoint, post] = fetchMock.mock.calls[2];
  expect(endpoint).toBe("/api/transcribe");
  expect(Buffer.byteLength(post.body)).toBeLessThan(4096);
  expect(JSON.parse(post.body)).toEqual({ audioRef });
  expect(stage.mock.calls).toEqual([["uploading"], ["transcribing"]]);
});
it("requests best-effort discard when transcription fails after upload", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, audioRef, uploadUrl }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
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
  expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({
    audioRef,
    discard: true,
  });
});
it("preserves the 180 second client timeout for the transcription request", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, audioRef, uploadUrl }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
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
  expect(fetchMock).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
});
