"use client";

import { useState } from "react";
import {
  ArrowRight,
  Plus,
  Trash2,
  Users,
  Mic,
  CalendarDays,
} from "lucide-react";
import { meetingSchema, newMeeting, type Meeting } from "@/lib/schemas/meeting";

export function MeetingForm({
  onSubmit,
  initialValue,
  submitLabel = "Iniciar reunión",
  editing = false,
}: {
  onSubmit: (meeting: Meeting) => void;
  initialValue?: Meeting;
  submitLabel?: string;
  editing?: boolean;
}) {
  const [value, setValue] = useState<Meeting>(initialValue ?? newMeeting);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const field = (
    name: "title" | "author" | "location" | "date" | "time",
    label: string,
    placeholder = "",
    type = "text",
  ) => (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {["title", "author"].includes(name) && (
          <span className="required"> *</span>
        )}
      </label>
      <input
        id={name}
        type={type}
        placeholder={placeholder}
        value={value[name]}
        maxLength={name === "title" ? 160 : 200}
        required={name !== "location"}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        onChange={(e) => setValue({ ...value, [name]: e.target.value })}
      />
      {errors[name] && (
        <span className="field-error" id={`${name}-error`}>
          {errors[name]}
        </span>
      )}
    </div>
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const result = meetingSchema.safeParse(value);
        if (!result.success) {
          setErrors(
            Object.fromEntries(
              result.error.issues.map((issue) => [
                issue.path.join("."),
                issue.message,
              ]),
            ),
          );
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLElement>('[aria-invalid="true"]')
              ?.focus(),
          );
          return;
        }
        setErrors({});
        onSubmit(result.data);
      }}
    >
      <div className="card form-card">
        <div className="section-heading">
          <span className="section-icon">
            <CalendarDays size={19} />
          </span>
          <div>
            <h2>Los detalles de la reunión</h2>
            <p>Un poco de contexto para una mejor minuta.</p>
          </div>
        </div>
        {field("title", "Título de la reunión", "Ej. Seguimiento del proyecto")}
        <div className="form-grid">
          {field("author", "Autor de la minuta", "Tu nombre")}
          {field(
            "location",
            "Lugar o modalidad",
            "Ej. Sala de reuniones · Online",
          )}
        </div>
        <div className="form-grid">
          {field("date", "Fecha", "", "date")}
          {field("time", "Hora", "", "time")}
        </div>
        <div className="section-heading participants-heading">
          <span className="section-icon">
            <Users size={19} />
          </span>
          <div>
            <h2>¿Quiénes participan?</h2>
            <p>Agregá sus nombres y, si corresponde, su área.</p>
          </div>
        </div>
        {value.participants.length === 0 && (
          <p className="empty-inline">
            Todavía no agregaste participantes. Podés comenzar sin ellos.
          </p>
        )}
        {value.participants.map((person, index) => (
          <div className="participant-row" key={index}>
            <div className="field">
              <label htmlFor={`person-${index}`}>
                Participante {index + 1}
              </label>
              <input
                id={`person-${index}`}
                value={person.name}
                placeholder="Nombre y apellido"
                maxLength={120}
                aria-invalid={!!errors[`participants.${index}.name`]}
                aria-describedby={
                  errors[`participants.${index}.name`]
                    ? `person-error-${index}`
                    : undefined
                }
                onChange={(e) =>
                  setValue({
                    ...value,
                    participants: value.participants.map((p, i) =>
                      i === index ? { ...p, name: e.target.value } : p,
                    ),
                  })
                }
              />
              {errors[`participants.${index}.name`] && (
                <span className="field-error" id={`person-error-${index}`}>
                  {errors[`participants.${index}.name`]}
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor={`area-${index}`}>
                Área <span className="muted">(opcional)</span>
              </label>
              <input
                id={`area-${index}`}
                value={person.area}
                placeholder="Ej. Operaciones"
                maxLength={120}
                onChange={(e) =>
                  setValue({
                    ...value,
                    participants: value.participants.map((p, i) =>
                      i === index ? { ...p, area: e.target.value } : p,
                    ),
                  })
                }
              />
            </div>
            <button
              type="button"
              className="icon-button remove-person"
              aria-label={`Eliminar participante ${index + 1}`}
              onClick={() =>
                setValue({
                  ...value,
                  participants: value.participants.filter(
                    (_, i) => i !== index,
                  ),
                })
              }
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button secondary small"
          disabled={value.participants.length >= 100}
          onClick={() =>
            setValue({
              ...value,
              participants: [...value.participants, { name: "", area: "" }],
            })
          }
        >
          <Plus size={16} />
          Agregar participante
        </button>
      </div>
      <div className="form-bottom">
        <p>
          {editing ? (
            "Los cambios se aplican a la minuta de esta sesión."
          ) : (
            <>
              <Mic size={16} />
              Te pediremos acceso al micrófono al comenzar.
            </>
          )}
        </p>
        <button className="button primary" type="submit">
          {submitLabel}
          <ArrowRight size={18} />
        </button>
      </div>
    </form>
  );
}
