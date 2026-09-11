import { z } from "zod";
import { meetingSchema, type Meeting } from "./meeting";
import { transcriptSchema } from "./api";

export const statusLabels = {
  open: "Abierto",
  closed: "Cerrado",
  pending: "Pendiente",
  under_review: "En evaluación",
} as const;
export const topicStatusSchema = z
  .enum(["open", "closed", "pending", "under_review"])
  .nullable();
const optionalText = z.string().trim().max(3000).nullable();
export const topicSchema = z.object({
  number: z.number().int().min(1),
  title: z.string().trim().min(1, "El punto necesita un título.").max(200),
  description: z.string().trim().min(1, "Describí lo que se trató.").max(6000),
  decision: optionalText,
  action: optionalText,
  responsible: z.string().trim().max(240).nullable(),
  deadline: z.string().trim().max(160).nullable(),
  pendingIssue: optionalText,
  status: topicStatusSchema,
});
export const minuteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  introduction: z.string().trim().min(1).max(6000),
  participants: z
    .array(
      z.object({
        area: z.string().max(120).nullable(),
        people: z.array(z.string().trim().min(1).max(120)).max(100),
      }),
    )
    .max(100),
  author: z.string().trim().min(1).max(120),
  date: z.iso.date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  location: z.string().trim().max(200).nullable(),
  topics: z.array(topicSchema).max(80),
});
// Metadata and numbering are deliberately absent from the model's output.
export const extractionSchema = z.object({
  introduction: z.string(),
  topics: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      decision: z.string().nullable(),
      action: z.string().nullable(),
      responsible: z.string().nullable(),
      deadline: z.string().nullable(),
      pendingIssue: z.string().nullable(),
      status: topicStatusSchema,
    }),
  ),
});
export const minutesRequestSchema = z.object({
  transcript: transcriptSchema,
  meeting: meetingSchema,
  outputLanguage: z.literal("es").default("es"),
});
export const minutesResponseSchema = z.object({
  success: z.literal(true),
  minutes: minuteSchema,
});
export type Minute = z.infer<typeof minuteSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type Extraction = z.infer<typeof extractionSchema>;
export function assembleMinute(
  meeting: Meeting,
  extraction: Extraction,
): Minute {
  const groups = new Map<string | null, string[]>();
  for (const person of meeting.participants) {
    const area = person.area || null;
    groups.set(area, [...(groups.get(area) ?? []), person.name]);
  }
  return minuteSchema.parse({
    title: `Minuta de reunión ${meeting.title}`,
    author: meeting.author,
    date: meeting.date,
    time: meeting.time,
    location: meeting.location || null,
    participants: [...groups].map(([area, people]) => ({ area, people })),
    introduction: extraction.introduction,
    topics: extraction.topics.map((topic, index) => ({
      ...topic,
      number: index + 1,
    })),
  });
}
