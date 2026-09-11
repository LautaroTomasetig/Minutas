// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
vi.mock("server-only", () => ({}));
const provider = vi.hoisted(() => ({
  create: vi.fn(),
  upload: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
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
import { transcribe } from "@/lib/server/transcribe";
import { withTimeout } from "@/lib/server/errors";

function webm() {
  return new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0])], {
    type: "audio/webm;codecs=opus",
  });
}
function audioRequest(data?: Blob) {
  const body = new FormData();
  if (data) body.append("audio", data, "meeting.webm");
  return new Request("http://localhost/api/transcribe", {
    method: "POST",
    body,
  });
}
beforeEach(() => {
  Object.values(provider).forEach((mock) => mock.mockReset());
  provider.upload.mockResolvedValue({
    name: "files/test-audio",
    uri: "https://example.test/test-audio",
    state: "ACTIVE",
    mimeType: "audio/webm",
  });
  provider.delete.mockResolvedValue({});
  provider.create.mockResolvedValue({
    status: "completed",
    output_text: JSON.stringify({
      transcript: " Revisamos el proyecto. ",
      detectedLanguage: "es-ES",
    }),
  });
});
describe("POST /api/transcribe", () => {
  it("rechaza audio ausente antes de llamar al proveedor", async () => {
    const response = await POST(audioRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "MISSING_AUDIO" },
    });
    expect(provider.upload).not.toHaveBeenCalled();
  });
  it("rechaza un archivo que finge ser WebM", async () => {
    const response = await POST(
      audioRequest(new Blob(["not audio"], { type: "audio/webm" })),
    );
    expect(response.status).toBe(422);
    expect(provider.upload).not.toHaveBeenCalled();
  });
  it("normaliza el idioma y envía los mismos bytes de audio; elimina el archivo remoto", async () => {
    const audio = webm();
    const response = await POST(audioRequest(audio));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      transcript: "Revisamos el proyecto.",
      detectedLanguage: "es",
    });
    const upload = provider.upload.mock.calls[0][0];
    expect(upload.config.mimeType).toBe("audio/webm");
    expect(await upload.file.arrayBuffer()).toEqual(await audio.arrayBuffer());
    expect(provider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3.5-transcribe",
        store: false,
        input: [
          {
            type: "audio",
            uri: "https://example.test/test-audio",
            mime_type: "audio/webm",
          },
        ],
        response_format: expect.objectContaining({
          mime_type: "application/json",
        }),
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        maxRetries: 0,
      }),
    );
    expect(provider.delete).toHaveBeenCalledWith(
      expect.objectContaining({ name: "files/test-audio" }),
    );
  });
  it("normaliza MP4 de audio a M4A sin convertir sus bytes", async () => {
    const audio = new Blob([new Uint8Array([0, 0, 0, 24]), "ftypisom"], {
      type: "audio/mp4",
    });
    expect((await POST(audioRequest(audio))).status).toBe(200);
    expect(provider.upload.mock.calls[0][0].config.mimeType).toBe("audio/m4a");
    expect(await provider.upload.mock.calls[0][0].file.arrayBuffer()).toEqual(
      await audio.arrayBuffer(),
    );
  });
  it("no procesa solicitudes que exceden el límite declarado", async () => {
    const request = new Request("http://localhost/api/transcribe", {
      method: "POST",
      headers: {
        "content-length": "25000000",
        "content-type": "multipart/form-data; boundary=x",
      },
      body: "x",
    });
    expect((await POST(request)).status).toBe(413);
    expect(provider.upload).not.toHaveBeenCalled();
  });
  it.each([
    { status: "completed", output_text: "not JSON" },
    {
      status: "incomplete",
      output_text: '{"transcript":"fragmento","detectedLanguage":"es"}',
    },
    {
      status: "completed",
      output_text: '{"transcript":12,"detectedLanguage":"es"}',
    },
    { status: "completed", output_text: '{"transcript":"texto"}' },
  ])(
    "rechaza respuestas inválidas con 502 y limpia el archivo",
    async (result) => {
      provider.create.mockResolvedValue(result);
      const response = await POST(audioRequest(webm()));
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        error: { code: "INVALID_PROVIDER_RESPONSE" },
      });
      expect(provider.delete).toHaveBeenCalledOnce();
    },
  );
  it("conserva el error de audio sin voz", async () => {
    provider.create.mockResolvedValue({
      status: "completed",
      output_text: '{"transcript":"","detectedLanguage":"und"}',
    });
    const response = await POST(audioRequest(webm()));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "NO_SPEECH" },
    });
  });
  it("devuelve un error seguro si Gemini agota la cuota", async () => {
    provider.create.mockRejectedValue(
      new ApiError({ status: 429, message: "private-provider-detail" }),
    );
    const response = await POST(audioRequest(webm()));
    expect(response.status).toBe(429);
    expect(await response.text()).not.toContain("private-provider-detail");
    expect(provider.delete).toHaveBeenCalledOnce();
  });
  it("rechaza archivos que Google no pudo procesar", async () => {
    provider.upload.mockResolvedValue({
      name: "files/test-audio",
      state: "FAILED",
    });
    expect((await POST(audioRequest(webm()))).status).toBe(502);
    expect(provider.create).not.toHaveBeenCalled();
    expect(provider.delete).toHaveBeenCalledOnce();
  });
  it("consulta el estado antes de transcribir un archivo en procesamiento", async () => {
    provider.upload.mockResolvedValue({
      name: "files/test-audio",
      state: "PROCESSING",
    });
    provider.get.mockResolvedValue({
      name: "files/test-audio",
      state: "ACTIVE",
      uri: "https://example.test/test-audio",
    });
    expect((await POST(audioRequest(webm()))).status).toBe(200);
    expect(provider.get).toHaveBeenCalledOnce();
  });
  it("mantiene el timeout aunque una subida ignore abort; limpia al finalizar tarde", async () => {
    let finishUpload!: (file: object) => void;
    provider.upload.mockReturnValue(
      new Promise((resolve) => {
        finishUpload = resolve;
      }),
    );
    const task = withTimeout(new AbortController().signal, 20, (signal) =>
      transcribe(
        new File([webm()], "test.webm", { type: "audio/webm" }),
        signal,
      ),
    );
    await expect(task).rejects.toMatchObject({ code: "TIMEOUT" });
    finishUpload({
      name: "files/test-audio",
      state: "ACTIVE",
      uri: "https://example.test/test-audio",
    });
    await vi.waitFor(() => expect(provider.delete).toHaveBeenCalledOnce());
    expect(provider.create).not.toHaveBeenCalled();
    expect(provider.delete.mock.calls[0][0].config.abortSignal.aborted).toBe(
      false,
    );
  });
  it("no pierde una transcripción válida si falla la limpieza remota", async () => {
    provider.delete.mockRejectedValue(
      new ApiError({ status: 503, message: "private-provider-detail" }),
    );
    expect((await POST(audioRequest(webm()))).status).toBe(200);
  });
});
