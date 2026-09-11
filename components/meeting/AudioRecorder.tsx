"use client";
import { useEffect, useState } from "react";
import {
  Mic,
  Pause,
  Play,
  Square,
  Download,
  AlertCircle,
  LoaderCircle,
  Check,
} from "lucide-react";
import type { AudioRecorderState } from "@/hooks/useAudioRecorder";
import { audioExtension, formatDuration } from "@/lib/audio";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function AudioRecorder({
  recorder,
  title,
  onProcess,
}: {
  recorder: AudioRecorderState;
  title: string;
  onProcess?: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [url, setUrl] = useState("");
  const { status, blob, seconds } = recorder;
  useEffect(() => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    // Synchronize a browser-owned resource, with revocation on replacement/unmount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  const labels = {
    idle: "Listo para comenzar",
    requesting: "Esperando permiso",
    recording: "Grabando",
    paused: "En pausa",
    stopping: "Finalizando audio",
    finished: "Grabación finalizada",
    error: "Revisá tu micrófono",
  };
  return (
    <div className="card recorder-card">
      <div className={`recording-badge ${status}`} role="status">
        {status === "requesting" || status === "stopping" ? (
          <LoaderCircle size={15} className="spin" />
        ) : status === "finished" ? (
          <Check size={15} />
        ) : (
          <span className="recording-dot" />
        )}
        {labels[status]}
      </div>
      <h2>{title}</h2>
      <div className={`mic-orbit ${status}`} aria-hidden="true">
        <Mic size={34} strokeWidth={1.5} />
      </div>
      <p
        className="timer"
        aria-label={`Tiempo grabado: ${formatDuration(seconds)}`}
      >
        {formatDuration(seconds)}
      </p>
      <p className="recorder-hint">
        {status === "paused"
          ? "Tomate un momento. El micrófono está en pausa."
          : status === "requesting"
            ? "Aceptá el permiso de micrófono en tu navegador."
            : status === "finished"
              ? "Tu conversación ya está lista para el siguiente paso."
              : "Este es el momento de escuchar, conversar y compartir ideas."}
      </p>
      {recorder.error && (
        <div className="notice error" role="alert">
          <AlertCircle size={17} />
          {recorder.error}
        </div>
      )}
      {recorder.notice && (
        <div className="notice" role="status">
          <AlertCircle size={17} />
          {recorder.notice}
        </div>
      )}
      <div className="recorder-controls">
        {(status === "idle" || status === "error") && (
          <button className="button primary" onClick={recorder.start}>
            <Mic size={18} />
            {status === "error" ? "Reintentar micrófono" : "Comenzar grabación"}
          </button>
        )}
        {status === "requesting" && (
          <button
            className="button secondary"
            onClick={recorder.cancelPermission}
          >
            Cancelar solicitud
          </button>
        )}
        {status === "recording" && (
          <button className="button secondary" onClick={recorder.pause}>
            <Pause size={18} />
            Pausar
          </button>
        )}
        {status === "paused" && (
          <button className="button secondary" onClick={recorder.resume}>
            <Play size={18} />
            Reanudar
          </button>
        )}
        {(status === "recording" || status === "paused") && (
          <button className="button danger" onClick={() => setConfirm(true)}>
            <Square size={15} />
            Finalizar reunión
          </button>
        )}
      </div>
      {status === "finished" && url && (
        <div className="audio-review">
          <audio controls src={url} aria-label="Escuchar grabación" />
          <div className="actions">
            <a
              href={url}
              download={`reunion.${audioExtension(blob!.type)}`}
              className="button secondary"
            >
              <Download size={16} />
              Descargar audio
            </a>
            {onProcess && (
              <button className="button primary" onClick={onProcess}>
                Procesar reunión
              </button>
            )}
          </div>
        </div>
      )}
      <div className="recorder-footnote">
        <span>Solo micrófono · Máximo 60 min</span>
        <span>{(recorder.bytes / 1_000_000).toFixed(1)} MB / 24 MB</span>
      </div>
      {confirm && (
        <ConfirmDialog
          title="¿Finalizar la reunión?"
          description="Se detendrá la grabación y podrás revisar el audio antes de generar la minuta."
          confirmLabel="Sí, finalizar"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            recorder.finish();
          }}
        />
      )}
    </div>
  );
}
