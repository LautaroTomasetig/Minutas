import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MeetingWorkspace } from "./MeetingWorkspace";
import { minuteFixture } from "@/tests/fixtures/meeting";
import { MAX_AUDIO_BYTES } from "@/lib/audio";

const api = vi.hoisted(() => ({
  transcribeAudio: vi.fn(),
  generateMinute: vi.fn(),
  translateTranscript: vi.fn(),
  downloadMinutePdf: vi.fn(),
}));
vi.mock("@/lib/api/meetings", () => api);
class Recorder {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  start() {
    this.state = "recording";
  }
  pause() {
    this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["recorded audio"]) });
      this.onstop?.();
    });
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  api.transcribeAudio.mockResolvedValue({
    success: true,
    transcript: "Conversación de prueba.",
    detectedLanguage: "es",
  });
  api.generateMinute.mockResolvedValue({
    success: true,
    minutes: minuteFixture,
  });
  vi.stubGlobal("MediaRecorder", Recorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
        getAudioTracks: () => [{ addEventListener: vi.fn() }],
      }),
    },
  });
  URL.createObjectURL = vi.fn().mockReturnValue("blob:test-audio");
  URL.revokeObjectURL = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(() => vi.unstubAllGlobals());
async function start(source: "file" | "microphone" = "file") {
  render(<MeetingWorkspace aiConfigured />);
  const user = userEvent.setup();
  if (source === "file")
    await user.click(screen.getByRole("button", { name: "Subir audio" }));
  await user.type(
    screen.getByLabelText(/Título de la reunión/),
    "Reunión existente",
  );
  await user.type(
    screen.getByLabelText(/Autor de la minuta/),
    "Autor de prueba",
  );
  await user.click(
    screen.getByRole("button", {
      name: source === "file" ? "Continuar con audio" : "Iniciar reunión",
    }),
  );
  return user;
}
function choose(file: File) {
  fireEvent.change(screen.getByLabelText("Seleccionar archivo de audio"), {
    target: { files: [file] },
  });
}
it("uses the same transcription/minutes pipeline for a selected file without requesting a microphone", async () => {
  const user = await start();
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  const file = new File(["ID3audio"], "reunion.mp3", { type: "audio/mpeg" });
  choose(file);
  expect(
    await screen.findByRole("heading", { name: file.name }),
  ).toBeInTheDocument();
  await user.click(
    await screen.findByRole("button", { name: "Procesar reunión" }),
  );
  expect(api.transcribeAudio).toHaveBeenCalledWith(
    file,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  await waitFor(() =>
    expect(api.generateMinute).toHaveBeenCalledWith(
      "Conversación de prueba.",
      expect.objectContaining({
        title: "Reunión existente",
        author: "Autor de prueba",
      }),
      expect.any(AbortSignal),
    ),
  );
  expect(
    await screen.findByRole("button", { name: "Exportar PDF" }),
  ).toBeInTheDocument();
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
});
it("keeps automatic microphone start, pause/resume, confirmation and the existing pipeline", async () => {
  const user = await start("microphone");
  expect(
    await screen.findByText("Grabando", { exact: true }),
  ).toBeInTheDocument();
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    audio: true,
  });
  expect(screen.getByRole("button", { name: "Subir audio" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Pausar" }));
  expect(screen.getByRole("button", { name: "Subir audio" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Reanudar" }));
  await user.click(screen.getByRole("button", { name: "Finalizar reunión" }));
  await user.click(screen.getByRole("button", { name: "Sí, finalizar" }));
  await user.click(
    await screen.findByRole("button", { name: "Procesar reunión" }),
  );
  expect(api.transcribeAudio.mock.calls[0][0]).toBeInstanceOf(Blob);
  expect(api.transcribeAudio.mock.calls[0][0].type).toBe("audio/webm");
  expect(
    await screen.findByRole("button", { name: "Exportar PDF" }),
  ).toBeInTheDocument();
});
it.each([
  ["reunion.mp3", "", "audio/mpeg"],
  ["reunion.wav", "audio/wav", "audio/wav"],
  ["reunion.M4A", "application/octet-stream", "audio/mp4"],
  ["reunion.m4a", "audio/m4a", "audio/mp4"],
  ["reunion.webm", "audio/webm", "audio/webm"],
])(
  "accepts supported files and missing/generic MIME: %s",
  async (name, mime, expected) => {
    const user = await start();
    choose(new File(["audio fixture"], name, { type: mime }));
    await user.click(
      await screen.findByRole("button", { name: "Procesar reunión" }),
    );
    expect(api.transcribeAudio.mock.calls[0][0]).toMatchObject({
      name,
      type: expected,
      size: 13,
    });
  },
);
it.each(["empty", "oversized", "unsupported"])(
  "rejects %s files before invoking transcription",
  async (kind) => {
    await start();
    const file = new File(
      kind === "empty" ? [] : ["audio"],
      kind === "unsupported" ? "documento.txt" : "reunion.wav",
      {
        type: kind === "unsupported" ? "text/plain" : "audio/wav",
      },
    );
    if (kind === "oversized")
      Object.defineProperty(file, "size", { value: MAX_AUDIO_BYTES + 1 });
    choose(file);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Procesar reunión" }),
    ).not.toBeInTheDocument();
    expect(api.transcribeAudio).not.toHaveBeenCalled();
  },
);
it("retains the file on processing failure and can retry it", async () => {
  const user = await start();
  api.transcribeAudio.mockRejectedValueOnce(new Error("Fallo de prueba"));
  const file = new File(["audio"], "reunion.wav", { type: "audio/wav" });
  choose(file);
  await user.click(
    await screen.findByRole("button", { name: "Procesar reunión" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Fallo de prueba");
  expect(screen.getByRole("heading", { name: file.name })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Procesar reunión" }));
  expect(
    await screen.findByRole("button", { name: "Exportar PDF" }),
  ).toBeInTheDocument();
  expect(api.transcribeAudio.mock.calls[1][0]).toBe(file);
});
it("revokes the old preview when replacing a selected file", async () => {
  const user = await start();
  const first = new File(["first"], "primero.wav", { type: "audio/wav" });
  const second = new File(["second"], "segundo.mp3", { type: "audio/mpeg" });
  choose(first);
  await screen.findByRole("heading", { name: first.name });
  choose(second);
  expect(
    await screen.findByRole("heading", { name: second.name }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: first.name }),
  ).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
  await user.click(
    await screen.findByRole("button", { name: "Procesar reunión" }),
  );
  expect(api.transcribeAudio.mock.calls[0][0]).toBe(second);
});
