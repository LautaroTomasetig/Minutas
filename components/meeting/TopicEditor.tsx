"use client";
import { useId, useState } from "react";
import { Check } from "lucide-react";
import { topicSchema, statusLabels, type Topic } from "@/lib/schemas/minute";

export function TopicEditor({
  topic,
  onSave,
  onCancel,
  isNew = false,
}: {
  topic: Topic;
  onSave: (topic: Topic) => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  const [draft, setDraft] = useState(topic);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const field = (
    key:
      | "title"
      | "description"
      | "decision"
      | "action"
      | "responsible"
      | "deadline"
      | "pendingIssue",
    label: string,
    multiline = false,
  ) => (
    <div className="field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      {multiline ? (
        <textarea
          id={`${id}-${key}`}
          rows={3}
          maxLength={key === "description" ? 6000 : 3000}
          value={draft[key] ?? ""}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      ) : (
        <input
          id={`${id}-${key}`}
          maxLength={key === "title" ? 200 : key === "responsible" ? 240 : 160}
          value={draft[key] ?? ""}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      )}
    </div>
  );
  return (
    <form
      className="topic-editor"
      aria-label={isNew ? "Agregar punto" : `Editar punto ${topic.number}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const normalized = { ...draft };
        for (const key of [
          "decision",
          "action",
          "responsible",
          "deadline",
          "pendingIssue",
        ] as const)
          normalized[key] = draft[key]?.trim() || null;
        const parsed = topicSchema.safeParse(normalized);
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        onSave(parsed.data);
      }}
    >
      <h3>{isNew ? "Agregar un punto" : `Editar punto ${topic.number}`}</h3>
      {field("title", "Título del punto")}
      {field("description", "Descripción", true)}
      {field("decision", "Decisión tomada", true)}
      {field("action", "Acción requerida", true)}
      <div className="form-grid">
        {field("responsible", "Responsable")}
        {field("deadline", "Fecha límite")}
      </div>
      {field("pendingIssue", "Punto pendiente", true)}
      <div className="field">
        <label htmlFor={`${id}-status`}>Estado</label>
        <select
          id={`${id}-status`}
          value={draft.status ?? ""}
          onChange={(e) =>
            setDraft({
              ...draft,
              status: e.target.value
                ? topicSchema.shape.status.parse(e.target.value)
                : null,
            })
          }
        >
          <option value="">No especificado</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions editor-actions">
        <button
          type="button"
          className="button secondary small"
          onClick={onCancel}
        >
          Cancelar edición
        </button>
        <button className="button primary small" type="submit">
          <Check size={15} />
          Aplicar cambios
        </button>
      </div>
    </form>
  );
}
