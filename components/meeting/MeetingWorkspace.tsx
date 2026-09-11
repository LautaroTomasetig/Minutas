"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Mic,
  FileText,
  Download,
  AlertCircle,
} from "lucide-react";
import { MeetingForm } from "./MeetingForm";
import type { Meeting } from "@/lib/schemas/meeting";
import type { Transcription } from "@/lib/schemas/api";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { AudioRecorder } from "./AudioRecorder";
import { ProcessingStatus, type ProcessingStage } from "./ProcessingStatus";
import { TranscriptPanel } from "./TranscriptPanel";
import {
  generateMinute,
  transcribeAudio,
  translateTranscript,
} from "@/lib/api/meetings";
import type { Minute } from "@/lib/schemas/minute";
import { MinuteResult } from "./MinuteResult";

export function MeetingWorkspace({
  aiConfigured = false,
}: {
  aiConfigured?: boolean;
}) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [transcription, setTranscription] = useState<Transcription | null>(
    null,
  );
  const [translation, setTranslation] = useState<string | null>(null);
  const [minute, setMinute] = useState<Minute | null>(null);
  const [processing, setProcessing] = useState<ProcessingStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const recorder = useAudioRecorder();
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!meeting) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("a[href]") &&
        !target.closest("a[download]") &&
        !window.confirm(
          "Al salir se perderán los datos de esta sesión. ¿Querés salir?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", navigate, true);
    };
  }, [meeting]);
  async function processAudio() {
    if (!recorder.blob || controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setError(null);
    setProcessing("transcribing");
    try {
      const transcript = await transcribeAudio(recorder.blob, current.signal);
      setTranscription(transcript);
      if (meeting) {
        setProcessing("generating");
        setMinute(
          (await generateMinute(transcript.transcript, meeting, current.signal))
            .minutes,
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos procesar el audio.",
      );
    } finally {
      controller.current = null;
      setProcessing(null);
    }
  }
  async function generate() {
    if (!transcription || !meeting || controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setError(null);
    setProcessing("generating");
    try {
      setMinute(
        (
          await generateMinute(
            transcription.transcript,
            meeting,
            current.signal,
          )
        ).minutes,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos generar la minuta.",
      );
    } finally {
      controller.current = null;
      setProcessing(null);
    }
  }
  async function translate() {
    if (!transcription || controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setError(null);
    setProcessing("translating");
    try {
      setTranslation(
        (await translateTranscript(transcription.transcript, current.signal))
          .translatedTranscript,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos traducir el texto.",
      );
    } finally {
      controller.current = null;
      setProcessing(null);
    }
  }
  return (
    <main className="container workspace">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} />
        Reuniones
      </Link>
      <div className="page-heading">
        <p className="eyebrow">UN ESPACIO PARA CADA CONVERSACIÓN</p>
        <h1>
          {minute
            ? "Tu minuta"
            : transcription
              ? "Tu conversación"
              : meeting
                ? "En reunión"
                : "Nueva reunión"}
          <span className="accent">.</span>
        </h1>
        <p>
          {minute
            ? "Lo que se conversó, listo para convertirse en próximos pasos."
            : meeting
              ? "Cada idea cuenta. Mantené esta pestaña abierta hasta terminar."
              : "Concentrate en la conversación. Nosotros nos ocupamos de la minuta."}
        </p>
      </div>
      <div className="workspace-grid">
        <div>
          {!aiConfigured && !minute && (
            <div className="notice">
              <AlertCircle size={17} />
              <p>
                La generación con IA todavía no está disponible. Podés grabar la
                reunión y descargar el audio.
              </p>
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              <AlertCircle size={17} />
              {error}
            </div>
          )}
          {processing && (
            <ProcessingStatus
              stage={processing}
              onCancel={() => controller.current?.abort()}
            />
          )}
          <div hidden={processing !== null}>
            {meeting ? (
              <>
                {minute && (
                  <MinuteResult minute={minute} onChange={setMinute} />
                )}
                {transcription ? (
                  <>
                    {minute ? (
                      <details className="result-support">
                        <summary>Consultar la transcripción</summary>
                        <TranscriptPanel
                          transcription={transcription}
                          translation={translation}
                          onTranslate={translate}
                        />
                      </details>
                    ) : (
                      <>
                        <TranscriptPanel
                          transcription={transcription}
                          translation={translation}
                          onTranslate={translate}
                        />
                        <div className="generate-actions">
                          <button className="button primary" onClick={generate}>
                            Generar minuta en español
                          </button>
                        </div>
                      </>
                    )}
                    <details className="audio-details">
                      <summary>Escuchar o descargar el audio</summary>
                      <AudioRecorder
                        recorder={recorder}
                        title={meeting.title}
                      />
                    </details>
                  </>
                ) : (
                  <AudioRecorder
                    recorder={recorder}
                    title={meeting.title}
                    onProcess={processAudio}
                  />
                )}
                <p className="session-note">
                  El audio y los datos permanecen en esta pestaña. Se perderán
                  al salir o recargar.
                </p>
              </>
            ) : (
              <MeetingForm
                onSubmit={(value) => {
                  setMeeting(value);
                  void recorder.start();
                }}
              />
            )}
          </div>
        </div>
        <aside className="guide">
          <p className="eyebrow">DE LA CONVERSACIÓN A LA ACCIÓN</p>
          <h2>
            Tu próxima minuta,
            <br />
            sin empezar de cero.
          </h2>
          <ol className="guide-steps">
            <li>
              <span>
                <Mic size={18} />
              </span>
              <div>
                <strong>Grabá la reunión</strong>
                <p>Desde tu navegador, a tu ritmo.</p>
              </div>
            </li>
            <li>
              <span>
                <FileText size={18} />
              </span>
              <div>
                <strong>Revisá lo importante</strong>
                <p>Temas, decisiones y próximos pasos.</p>
              </div>
            </li>
            <li>
              <span>
                <Download size={18} />
              </span>
              <div>
                <strong>Llevate una minuta clara</strong>
                <p>Editá y exportá un PDF listo para compartir.</p>
              </div>
            </li>
          </ol>
          <div className="guide-note">
            <Check size={17} />
            <p>
              Vos tenés la última palabra.
              <br />
              Siempre podés revisar y editar.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
