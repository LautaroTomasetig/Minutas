"use client";
import { FileText, Languages, Download } from "lucide-react";
import type { Transcription } from "@/lib/schemas/api";
export function TranscriptPanel({
  transcription,
  translation,
  onTranslate,
}: {
  transcription: Transcription;
  translation: string | null;
  onTranslate?: () => void;
}) {
  function download() {
    const url = URL.createObjectURL(
      new Blob([translation ?? transcription.transcript], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "transcripcion.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  let language = "No determinado";
  try {
    language =
      transcription.detectedLanguage === "und"
        ? language
        : (new Intl.DisplayNames(["es"], { type: "language" }).of(
            transcription.detectedLanguage,
          ) ?? language);
  } catch {
    /* Unknown language. */
  }
  return (
    <div className="card transcript-card">
      <div className="section-heading">
        <span className="section-icon">
          <FileText size={19} />
        </span>
        <div>
          <h2>La conversación, por escrito</h2>
          <p>
            Idioma principal detectado: {language}. Puede haber otros idiomas.
          </p>
        </div>
      </div>
      <details open={!translation}>
        <summary>Transcripción original</summary>
        <p className="transcript-text">{transcription.transcript}</p>
      </details>
      {translation && (
        <details open>
          <summary>Traducción al español</summary>
          <p className="transcript-text">{translation}</p>
        </details>
      )}
      <div className="actions">
        {!translation && onTranslate && (
          <button className="button secondary small" onClick={onTranslate}>
            <Languages size={16} />
            Traducir al español
          </button>
        )}
        <button className="button ghost small" onClick={download}>
          <Download size={16} />
          Descargar texto
        </button>
      </div>
    </div>
  );
}
