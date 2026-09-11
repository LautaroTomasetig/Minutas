"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUDIO_MIME_TYPES,
  MAX_RECORDING_SECONDS,
  RECORDING_STOP_BYTES,
} from "@/lib/audio";

export type RecorderStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "stopping"
  | "finished"
  | "error";
export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const accumulated = useRef(0);
  const started = useRef(0);
  const stopTracks = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);
  const clearTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  const elapsed = useCallback(
    () =>
      accumulated.current +
      (recorder.current?.state === "recording"
        ? performance.now() - started.current
        : 0),
    [],
  );
  const finish = useCallback(() => {
    const current = recorder.current;
    if (!current || current.state === "inactive") return;
    const finalTime = elapsed();
    accumulated.current = finalTime;
    setSeconds(Math.floor(finalTime / 1000));
    clearTimer();
    setStatus("stopping");
    current.stop();
    stopTracks();
  }, [clearTimer, elapsed, stopTracks]);
  const cancelPermission = useCallback(() => {
    generation.current++;
    busy.current = false;
    setStatus("idle");
    setError(null);
  }, []);
  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const requestId = ++generation.current;
    setError(null);
    setNotice(null);
    setBlob(null);
    setSeconds(0);
    setBytes(0);
    accumulated.current = 0;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      busy.current = false;
      setStatus("error");
      setError(
        "Tu navegador no permite grabar aquí. Abrí la aplicación en HTTPS o localhost con un navegador compatible.",
      );
      return;
    }
    setStatus("requesting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (requestId !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mimeType = AUDIO_MIME_TYPES.find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      if (!mimeType) throw new Error("UNSUPPORTED_FORMAT");
      const current = new MediaRecorder(media, {
        mimeType,
        audioBitsPerSecond: 64_000,
      });
      recorder.current = current;
      const chunks: Blob[] = [];
      let total = 0;
      current.ondataavailable = (event) => {
        if (requestId !== generation.current || !event.data.size) return;
        chunks.push(event.data);
        total += event.data.size;
        setBytes(total);
        if (total >= RECORDING_STOP_BYTES && current.state !== "inactive") {
          setNotice(
            "La grabación llegó al límite de tamaño. Guardamos el audio disponible para que puedas procesarlo o descargarlo.",
          );
          finish();
        }
      };
      current.onstop = () => {
        clearTimer();
        stopTracks();
        if (requestId !== generation.current) return;
        busy.current = false;
        const audio = new Blob(chunks, { type: current.mimeType || mimeType });
        if (!audio.size) {
          setError(
            "No se obtuvo audio. Revisá el micrófono e intentá grabar nuevamente.",
          );
          setStatus("error");
          return;
        }
        setBlob(audio);
        setStatus("finished");
      };
      current.onerror = () => {
        setNotice(
          "El micrófono tuvo un problema. Conservamos los fragmentos recibidos.",
        );
        finish();
      };
      media.getAudioTracks().forEach((track) =>
        track.addEventListener("ended", () => {
          if (
            current.state !== "inactive" &&
            requestId === generation.current
          ) {
            setNotice(
              "El micrófono se desconectó. La grabación se finalizó con el audio disponible.",
            );
            finish();
          }
        }),
      );
      current.start(1000);
      started.current = performance.now();
      setStatus("recording");
      timer.current = setInterval(() => {
        const duration = Math.floor(elapsed() / 1000);
        setSeconds(duration);
        if (duration >= MAX_RECORDING_SECONDS) {
          setNotice(
            "Se alcanzó el máximo de 60 minutos. El audio está listo para procesar.",
          );
          finish();
        }
      }, 250);
    } catch (cause) {
      if (requestId !== generation.current) return;
      clearTimer();
      stopTracks();
      busy.current = false;
      setStatus("error");
      const name =
        typeof cause === "object" && cause !== null && "name" in cause
          ? String(cause.name)
          : "";
      setError(
        name === "NotAllowedError"
          ? "No tenemos permiso para usar el micrófono. Habilitalo en tu navegador y volvé a intentar."
          : name === "NotFoundError"
            ? "No encontramos un micrófono. Conectá uno y volvé a intentar."
            : name === "NotReadableError"
              ? "No pudimos acceder al micrófono. Revisá si otra aplicación lo está usando."
              : "No pudimos iniciar una grabación compatible. Revisá el micrófono o probá con otro navegador.",
      );
    }
  }, [clearTimer, elapsed, finish, stopTracks]);
  const pause = useCallback(() => {
    if (recorder.current?.state !== "recording") return;
    accumulated.current = elapsed();
    recorder.current.pause();
    setStatus("paused");
  }, [elapsed]);
  const resume = useCallback(() => {
    if (recorder.current?.state !== "paused") return;
    recorder.current.resume();
    started.current = performance.now();
    setStatus("recording");
  }, []);
  useEffect(
    () => () => {
      generation.current++;
      clearTimer();
      if (recorder.current && recorder.current.state !== "inactive")
        recorder.current.stop();
      stopTracks();
      busy.current = false;
    },
    [clearTimer, stopTracks],
  );
  return {
    status,
    seconds,
    bytes,
    blob,
    error,
    notice,
    start,
    pause,
    resume,
    finish,
    cancelPermission,
  };
}
export type AudioRecorderState = ReturnType<typeof useAudioRecorder>;
