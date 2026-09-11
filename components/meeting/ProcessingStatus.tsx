import {
  Check,
  FileText,
  Languages,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
export type ProcessingStage =
  "uploading" | "transcribing" | "translating" | "generating";
export function ProcessingStatus({
  stage,
  onCancel,
}: {
  stage: ProcessingStage;
  onCancel: () => void;
}) {
  const titles = {
    uploading: "Subiendo audio…",
    transcribing: "Tu conversación está tomando forma.",
    translating: "La misma conversación, en español.",
    generating: "Ordenando las ideas de tu equipo.",
  };
  return (
    <div className="card processing-card" role="status" aria-live="polite">
      <span className="processing-icon">
        <LoaderCircle className="spin" size={30} />
      </span>
      <h2>{titles[stage]}</h2>
      <p>Podés dejar esta pestaña abierta mientras procesamos la reunión.</p>
      <ol className="processing-steps">
        <li
          className={
            stage === "transcribing" || stage === "uploading"
              ? "active"
              : "done"
          }
        >
          <span>
            {stage === "transcribing" || stage === "uploading" ? (
              <FileText size={18} />
            ) : (
              <Check size={18} />
            )}
          </span>
          <div>
            <strong>
              {stage === "uploading"
                ? "Subiendo audio…"
                : stage === "transcribing"
                  ? "Transcribiendo…"
                  : "Transcripción disponible"}
            </strong>
            <p>Conservamos la conversación en su idioma original.</p>
          </div>
        </li>
        {stage === "translating" && (
          <li className="active">
            <span>
              <Languages size={18} />
            </span>
            <div>
              <strong>Traduciendo al español…</strong>
              <p>El texto original se mantiene disponible.</p>
            </div>
          </li>
        )}
        {stage === "generating" && (
          <li className="active">
            <span>
              <Sparkles size={18} />
            </span>
            <div>
              <strong>Generando minuta…</strong>
              <p>Extrayendo temas, decisiones y próximos pasos.</p>
            </div>
          </li>
        )}
      </ol>
      <button className="button secondary small" onClick={onCancel}>
        Cancelar procesamiento
      </button>
      <p className="processing-note">
        Tus datos se conservan en esta sesión si cancelás.
      </p>
    </div>
  );
}
