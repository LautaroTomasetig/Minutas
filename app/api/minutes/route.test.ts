// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const provider = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/server/ai", async (original) => ({
  ...(await original<typeof import("@/lib/server/ai")>()),
  aiClient: () => ({ interactions: provider }),
  minutesModel: () => "test-model",
}));
import { POST } from "./route";
import { extractionFixture, meetingFixture } from "@/tests/fixtures/meeting";
function input(transcript: string) {
  return new Request("http://localhost/api/minutes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meeting: meetingFixture, transcript }),
  });
}
beforeEach(() => provider.create.mockReset());
describe("POST /api/minutes", () => {
  it("valida los datos antes de llamar a la IA", async () => {
    expect((await POST(input(" "))).status).toBe(400);
    expect(provider.create).not.toHaveBeenCalled();
  });
  it("compone metadatos y preserva los campos desconocidos como null", async () => {
    provider.create.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify(extractionFixture),
    });
    const response = await POST(input("Conversación de prueba"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.minutes.author).toBe(meetingFixture.author);
    expect(data.minutes.participants[1]).toEqual({
      area: "Ingeniería",
      people: ["Luis García"],
    });
    expect(data.minutes.topics[1]).toMatchObject({
      number: 2,
      decision: null,
      action: null,
      responsible: null,
      status: null,
    });
  });
  it("rechaza estados fuera del contrato y salidas incompletas", async () => {
    provider.create.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify({
        ...extractionFixture,
        topics: [{ ...extractionFixture.topics[0], status: "inventado" }],
      }),
    });
    expect((await POST(input("Conversación"))).status).toBe(502);
    provider.create.mockResolvedValue({
      status: "incomplete",
      output_text: JSON.stringify(extractionFixture),
    });
    expect((await POST(input("Conversación"))).status).toBe(502);
  });
  it("trata JSON inválido del proveedor como 502 y no como error del cliente", async () => {
    provider.create.mockResolvedValue({
      status: "completed",
      output_text: "{broken",
    });
    const response = await POST(input("Conversación"));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_MINUTES" },
    });
  });
  it("valida también los límites finales de la minuta", async () => {
    provider.create.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify({
        ...extractionFixture,
        introduction: "x".repeat(6001),
      }),
    });
    expect((await POST(input("Conversación"))).status).toBe(502);
  });
});
