"use client";
import { useEffect, useState } from "react";
import { Upload, Download } from "lucide-react";
import { MAX_AUDIO_BYTES } from "@/lib/audio";
import { audioMimeSchema } from "@/lib/schemas/audioUpload";

const extensionMime: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  webm: "audio/webm",
};
export function AudioFileInput({
  file,
  onSelect,
  onProcess,
}: {
  file: File | null;
  onSelect?: (file: File | null) => void;
  onProcess?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    const nextUrl = file ? URL.createObjectURL(file) : "";
    // Synchronize the browser-owned preview and revoke it on replacement/unmount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(nextUrl);
    return () => {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [file]);
  function select(candidate: File | undefined) {
    if (!candidate) return;
    setError(null);
    if (!candidate.size || candidate.size > MAX_AUDIO_BYTES) {
      onSelect?.(null);
      setError(
        `El audio debe tener contenido y pesar hasta ${MAX_AUDIO_BYTES / 1_000_000} MB.`,
      );
      return;
    }
    let mime = candidate.type.split(";")[0].toLowerCase();
    // Some desktop browsers supply no MIME (or a generic MIME). Set metadata
    // from a supported extension; bytes are unchanged and the server validates magic bytes.
    if (!mime || mime === "application/octet-stream" || mime === "audio/m4a") {
      mime =
        extensionMime[candidate.name.split(".").pop()?.toLowerCase() ?? ""] ??
        "";
    }
    if (!audioMimeSchema.safeParse(mime).success) {
      onSelect?.(null);
      setError("Elegí un archivo MP3, WAV, M4A, MP4 o WebM.");
      return;
    }
    onSelect?.(
      candidate.type === mime
        ? candidate
        : new File([candidate], candidate.name, {
            type: mime,
            lastModified: candidate.lastModified,
          }),
    );
  }
  return (
    <div className="card recorder-card">
      <div className="section-heading">
        <span className="section-icon">
          <Upload size={19} />
        </span>
        <div>
          <h2>Audio de la reunión</h2>
          <p>Usá una grabación que ya tengas en tu computadora.</p>
        </div>
      </div>
      {onSelect && (
        <div className="field">
          <label htmlFor="meeting-audio-file">
            Seleccionar archivo de audio
          </label>
          <input
            id="meeting-audio-file"
            type="file"
            accept={[
              ".mp3",
              ".wav",
              ".m4a",
              ".mp4",
              ".webm",
              ...audioMimeSchema.options,
            ].join(",")}
            aria-describedby="audio-file-help"
            aria-invalid={!!error}
            onChange={(event) => {
              select(event.currentTarget.files?.[0]);
            }}
          />
        </div>
      )}
      <p className="recorder-hint" id="audio-file-help">
        MP3, WAV, M4A, MP4 o WebM · Máximo {MAX_AUDIO_BYTES / 1_000_000} MB.
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {file && (
        <>
          <h2>{file.name}</h2>
          <p>{(file.size / 1_000_000).toFixed(1)} MB</p>
          {url && (
            <div className="audio-review">
              <audio
                controls
                src={url}
                aria-label="Escuchar audio seleccionado"
              />
              <div className="actions">
                <a href={url} download={file.name} className="button secondary">
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
        </>
      )}
    </div>
  );
}
