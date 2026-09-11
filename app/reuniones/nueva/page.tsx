import { MeetingWorkspace } from "@/components/meeting/MeetingWorkspace";

export const dynamic = "force-dynamic";
export default function NewMeetingPage() {
  return (
    <MeetingWorkspace
      aiConfigured={Boolean(process.env.GEMINI_API_KEY?.trim())}
    />
  );
}
