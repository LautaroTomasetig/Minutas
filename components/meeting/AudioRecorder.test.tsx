import {
  render,
  screen,
  waitFor,
  act,
  renderHook,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { AudioRecorder } from "./AudioRecorder";

const stopTrack = vi.fn();
const media = {
  getTracks: () => [{ stop: stopTrack }],
  getAudioTracks: () => [{ addEventListener: vi.fn() }],
};
class MockRecorder {
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
      this.ondataavailable?.({ data: new Blob(["audio final"]) });
      this.onstop?.();
    });
  }
}
function Harness() {
  return (
    <AudioRecorder title="Reunión de equipo" recorder={useAudioRecorder()} />
  );
}
beforeEach(() => {
  stopTrack.mockClear();
  vi.stubGlobal("MediaRecorder", MockRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(media) },
  });
  URL.createObjectURL = vi.fn().mockReturnValue("blob:audio");
  URL.revokeObjectURL = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(() => vi.unstubAllGlobals());
describe("AudioRecorder", () => {
  it("inicia disponible sin pedir permiso", () => {
    render(<Harness />);
    expect(screen.getByText("Listo para comenzar")).toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
  it("explica el permiso rechazado y permite reintentar", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new DOMException("denied", "NotAllowedError"),
    );
    render(<Harness />);
    await userEvent.click(
      screen.getByRole("button", { name: /comenzar grabación/i }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No tenemos permiso",
    );
    expect(
      screen.getByRole("button", { name: /reintentar micrófono/i }),
    ).toBeInTheDocument();
  });
  it("graba, pausa, reanuda y espera confirmación antes de finalizar", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: /comenzar grabación/i }),
    );
    expect(await screen.findByText("Grabando")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pausar" }));
    expect(screen.getByText("En pausa")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reanudar" }));
    await user.click(screen.getByRole("button", { name: "Finalizar reunión" }));
    expect(stopTrack).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sí, finalizar" }));
    expect(await screen.findByText("Grabación finalizada")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Descargar audio" }),
    ).toHaveAttribute("download", "reunion.webm");
    expect(stopTrack).toHaveBeenCalled();
  });
  it("libera permisos concedidos después de cancelar", async () => {
    let resolve!: (stream: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { result } = renderHook(useAudioRecorder);
    act(() => {
      void result.current.start();
    });
    act(() => result.current.cancelPermission());
    await act(async () => resolve(media as unknown as MediaStream));
    await waitFor(() => expect(stopTrack).toHaveBeenCalled());
    expect(result.current.status).toBe("idle");
  });
});
