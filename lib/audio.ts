export const MAX_AUDIO_BYTES = 24_000_000;
export const RECORDING_STOP_BYTES = 22_000_000;
export const MAX_RECORDING_SECONDS = 60 * 60;
export const AUDIO_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/webm",
];
export function audioExtension(mime: string) {
  return mime.includes("mp4") ? "m4a" : "webm";
}
export function formatDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
