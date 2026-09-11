// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const provider = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/server/ai", async (original) => ({
  ...(await original<typeof import("@/lib/server/ai")>()),
  aiClient: () => ({ interactions: provider }),
}));
import { POST } from "./route";
function input(transcript: string) {
  return new Request("http://localhost/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
}
beforeEach(() => provider.create.mockReset());
describe("POST /api/translate", () => {
  it("valida antes de llamar a Gemini", async () => {
    expect((await POST(input(" "))).status).toBe(400);
    expect(provider.create).not.toHaveBeenCalled();
  });
  it("mantiene el contrato y envía la transcripción como dato", async () => {
    provider.create.mockResolvedValue({
      status: "completed",
      output_text: '{"translatedTranscript":"Revisamos el proyecto."}',
    });
    const response = await POST(input("We reviewed the project."));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      translatedTranscript: "Revisamos el proyecto.",
    });
    expect(provider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        store: false,
        input: JSON.stringify({ transcript: "We reviewed the project." }),
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        maxRetries: 0,
      }),
    );
  });
  it.each([
    { status: "completed", output_text: "not JSON" },
    {
      status: "incomplete",
      output_text: '{"translatedTranscript":"fragmento"}',
    },
    { status: "completed", output_text: '{"translatedTranscript":12}' },
    { status: "completed", output_text: '{"translatedTranscript":" "}' },
  ])(
    "rechaza traducciones inválidas sin reemplazar el original",
    async (result) => {
      provider.create.mockResolvedValue(result);
      const response = await POST(input("Original."));
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        error: { code: "INVALID_TRANSLATION" },
      });
    },
  );
});
