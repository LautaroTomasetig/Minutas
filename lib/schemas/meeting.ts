import { z } from "zod";

export const meetingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Ingresá un título para la reunión.")
    .max(160, "Usá hasta 160 caracteres."),
  author: z.string().trim().min(1, "Ingresá el nombre del autor.").max(120),
  location: z.string().trim().max(200),
  date: z.iso.date("Ingresá una fecha válida."),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ingresá una hora válida."),
  participants: z
    .array(
      z.object({
        name: z
          .string()
          .trim()
          .min(1, "Ingresá un nombre o eliminá la fila.")
          .max(120),
        area: z.string().trim().max(120),
      }),
    )
    .max(100),
});

export type Meeting = z.infer<typeof meetingSchema>;

export function newMeeting(): Meeting {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    title: "",
    author: "",
    location: "",
    participants: [],
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}
