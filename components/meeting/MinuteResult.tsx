"use client";
import { useEffect, useRef, useState } from "react";
import {
  FileText,
  CheckCircle2,
  Pencil,
  Plus,
  Trash2,
  Download,
  LoaderCircle,
} from "lucide-react";
import { downloadMinutePdf } from "@/lib/api/meetings";
import {
  assembleMinute,
  minuteSchema,
  statusLabels,
  type Minute,
  type Topic,
} from "@/lib/schemas/minute";
import { TopicEditor } from "./TopicEditor";
import { MeetingForm } from "./MeetingForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function MinuteResult({
  minute,
  onChange,
}: {
  minute: Minute;
  onChange: (minute: Minute) => void;
}) {
  const [editing, setEditing] = useState<
    number | "metadata" | "introduction" | null
  >(null);
  const [introduction, setIntroduction] = useState(minute.introduction);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => () => exportController.current?.abort(), []);
  async function exportPdf() {
    if (exportController.current || editing !== null) return;
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setError(null);
    try {
      const pdf = await downloadMinutePdf(minute, controller.signal);
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${minute.title.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ -]/g, "").slice(0, 100) || "minuta"}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("PDF exportado con los cambios aplicados.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No pudimos exportar el PDF.",
      );
    } finally {
      exportController.current = null;
      setExporting(false);
    }
  }
  function apply(next: Minute) {
    const result = minuteSchema.safeParse(next);
    if (!result.success) {
      setError("Revisá los datos: hay campos vacíos o demasiado largos.");
      return;
    }
    onChange(result.data);
    setEditing(null);
    setError(null);
    setMessage("Cambios aplicados en esta sesión.");
  }
  const emptyTopic: Topic = {
    number: minute.topics.length + 1,
    title: "",
    description: "",
    decision: null,
    action: null,
    responsible: null,
    deadline: null,
    pendingIssue: null,
    status: null,
  };
  return (
    <section className="minute-result">
      <div className="result-banner">
        <CheckCircle2 size={19} />
        <div>
          <strong>Tu minuta está lista para revisar</strong>
          <p>
            Verificá los datos, las decisiones y los responsables antes de
            compartirla.
          </p>
        </div>
      </div>
      <div className="result-toolbar">
        <p>
          {editing !== null
            ? "Aplicá o cancelá la edición antes de exportar."
            : "Documento editable · En español"}
        </p>
        <button
          className="button primary"
          disabled={editing !== null || exporting}
          onClick={exportPdf}
        >
          {exporting ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Download size={17} />
          )}
          {exporting ? "Preparando PDF…" : "Exportar PDF"}
        </button>
      </div>
      <p className="edit-message" role="status">
        {message}
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="card minute-document">
        <div className="document-heading">
          <span className="eyebrow">MINUTA DE REUNIÓN</span>
          <FileText size={21} />
        </div>
        <h2 className="document-title">{minute.title}</h2>
        {editing === "metadata" ? (
          <div className="metadata-editor">
            <MeetingForm
              editing
              initialValue={{
                title: minute.title.replace(/^Minuta de reunión /, ""),
                author: minute.author,
                date: minute.date,
                time: minute.time,
                location: minute.location ?? "",
                participants: minute.participants.flatMap((group) =>
                  group.people.map((name) => ({
                    name,
                    area: group.area ?? "",
                  })),
                ),
              }}
              submitLabel="Aplicar datos"
              onSubmit={(meeting) =>
                apply(
                  assembleMinute(meeting, {
                    introduction: minute.introduction,
                    topics: minute.topics,
                  }),
                )
              }
            />
            <button
              className="button ghost small"
              onClick={() => setEditing(null)}
            >
              Cancelar edición
            </button>
          </div>
        ) : (
          <>
            <dl className="metadata-grid">
              <div>
                <dt>Autor</dt>
                <dd>{minute.author}</dd>
              </div>
              <div>
                <dt>Fecha y hora</dt>
                <dd>
                  {minute.date.split("-").reverse().join("/")} · {minute.time}
                </dd>
              </div>
              <div>
                <dt>Lugar</dt>
                <dd>{minute.location || "No especificado"}</dd>
              </div>
              <div>
                <dt>Participantes</dt>
                <dd>
                  {minute.participants.length
                    ? minute.participants.map((group, index) => (
                        <p key={index}>
                          {group.area && <strong>{group.area}: </strong>}
                          {group.people.join(", ")}
                        </p>
                      ))
                    : "No especificado"}
                </dd>
              </div>
            </dl>
            <button
              className="button ghost small"
              disabled={editing !== null || exporting}
              onClick={() => {
                setEditing("metadata");
                setMessage("");
              }}
            >
              <Pencil size={13} />
              Editar datos
            </button>
          </>
        )}
        <div className="introduction">
          <div className="introduction-heading">
            <h3>Introducción</h3>
            {editing !== "introduction" && (
              <button
                className="button ghost small"
                disabled={editing !== null || exporting}
                aria-label="Editar introducción"
                onClick={() => {
                  setIntroduction(minute.introduction);
                  setEditing("introduction");
                  setMessage("");
                }}
              >
                <Pencil size={13} />
                Editar
              </button>
            )}
          </div>
          {editing === "introduction" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                apply({ ...minute, introduction });
              }}
            >
              <div className="field">
                <label className="visually-hidden" htmlFor="introduction">
                  Introducción
                </label>
                <textarea
                  id="introduction"
                  value={introduction}
                  maxLength={6000}
                  rows={6}
                  onChange={(e) => setIntroduction(e.target.value)}
                />
              </div>
              <div className="actions editor-actions">
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => setEditing(null)}
                >
                  Cancelar edición
                </button>
                <button type="submit" className="button primary small">
                  Aplicar cambios
                </button>
              </div>
            </form>
          ) : (
            <p>{minute.introduction}</p>
          )}
        </div>
        <div className="topics-heading">
          <h3>Puntos tratados</h3>
          <span>{minute.topics.length} puntos</span>
        </div>
        {!minute.topics.length && (
          <p className="empty-inline">
            No se identificaron temas concretos. Podés agregar un punto
            manualmente.
          </p>
        )}
        {minute.topics.map((topic) =>
          editing === topic.number ? (
            <TopicEditor
              key={topic.number}
              topic={topic}
              onCancel={() => setEditing(null)}
              onSave={(value) =>
                apply({
                  ...minute,
                  topics: minute.topics.map((item) =>
                    item.number === topic.number ? value : item,
                  ),
                })
              }
            />
          ) : (
            <article
              className="topic-card"
              key={topic.number}
              aria-label={`Punto ${topic.number}: ${topic.title}`}
            >
              <div className="topic-heading">
                <span className="topic-number">
                  {String(topic.number).padStart(2, "0")}
                </span>
                <h3>{topic.title}</h3>
                <span
                  className={`status-badge ${topic.status ?? "unspecified"}`}
                >
                  {topic.status
                    ? statusLabels[topic.status]
                    : "No especificado"}
                </span>
              </div>
              <p className="topic-description">{topic.description}</p>
              <dl className="topic-details">
                {[
                  ["Decisión", topic.decision],
                  ["Acción requerida", topic.action],
                  ["Responsable", topic.responsible],
                  ["Fecha límite", topic.deadline],
                  ["Punto pendiente", topic.pendingIssue],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "No especificado"}</dd>
                  </div>
                ))}
              </dl>
              <div className="topic-actions">
                <button
                  className="button ghost small"
                  disabled={editing !== null || exporting}
                  aria-label={`Editar punto ${topic.number}`}
                  onClick={() => {
                    setEditing(topic.number);
                    setMessage("");
                  }}
                >
                  <Pencil size={13} />
                  Editar punto
                </button>
                <button
                  className="icon-button"
                  disabled={editing !== null || exporting}
                  aria-label={`Eliminar punto ${topic.number}`}
                  onClick={() => setDeleting(topic.number)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ),
        )}
        {editing === -1 ? (
          <TopicEditor
            topic={emptyTopic}
            isNew
            onCancel={() => setEditing(null)}
            onSave={(value) =>
              apply({ ...minute, topics: [...minute.topics, value] })
            }
          />
        ) : (
          <button
            className="button secondary small"
            disabled={
              editing !== null || exporting || minute.topics.length >= 80
            }
            onClick={() => {
              setEditing(-1);
              setMessage("");
            }}
          >
            <Plus size={15} />
            Agregar punto
          </button>
        )}
      </div>
      {deleting !== null && (
        <ConfirmDialog
          title="¿Eliminar este punto?"
          description="El punto se quitará de la minuta y se actualizará la numeración de los demás."
          confirmLabel="Eliminar punto"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            apply({
              ...minute,
              topics: minute.topics
                .filter((topic) => topic.number !== deleting)
                .map((topic, index) => ({ ...topic, number: index + 1 })),
            });
            setDeleting(null);
          }}
        />
      )}
    </section>
  );
}
