import type { Meeting } from "@/lib/schemas/meeting";
import type { Minute, Extraction } from "@/lib/schemas/minute";
import { assembleMinute } from "@/lib/schemas/minute";
export const meetingFixture: Meeting = {
  title: "Seguimiento del proyecto",
  author: "Ana Pérez",
  date: "2026-09-10",
  time: "10:00",
  location: "Sala de reuniones",
  participants: [
    { name: "Ana Pérez", area: "Producto" },
    { name: "Luis García", area: "Ingeniería" },
  ],
};
export const extractionFixture: Extraction = {
  introduction:
    "Se revisaron los avances del proyecto y las tareas necesarias para la próxima entrega.",
  topics: [
    {
      title: "Revisión del prototipo",
      description:
        "El equipo revisó el prototipo y confirmó que cumple los objetivos definidos.",
      decision: "Validar el prototipo presentado.",
      action: "Compartir el prototipo con el equipo.",
      responsible: "Luis García",
      deadline: null,
      pendingIssue: null,
      status: "closed",
    },
    {
      title: "Próxima entrega",
      description:
        "Se sugirió adelantar la entrega. No hubo una decisión confirmada.",
      decision: null,
      action: null,
      responsible: null,
      deadline: null,
      pendingIssue: "Definir la fecha de entrega.",
      status: null,
    },
  ],
};
export const minuteFixture: Minute = assembleMinute(
  meetingFixture,
  extractionFixture,
);
