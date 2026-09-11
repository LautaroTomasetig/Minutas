// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { exportMinute } from "./exportMinute";
import { minuteFixture } from "@/tests/fixtures/meeting";

describe("PDF export", () => {
  it("genera el mismo archivo para los mismos datos, sin depender de la hora", async () => {
    const first = await exportMinute(minuteFixture);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2035-05-15T11:00:00Z"));
    let second: Buffer;
    try {
      second = await exportMinute(structuredClone(minuteFixture));
    } finally {
      vi.useRealTimers();
    }
    expect(first.subarray(0, 5).toString()).toBe("%PDF-");
    expect(first.equals(second)).toBe(true);
  }, 20000);
  it("pagina contenido largo y refleja cambios en los datos", async () => {
    const base = await exportMinute(minuteFixture);
    const extended = await exportMinute({
      ...minuteFixture,
      topics: Array.from({ length: 12 }, (_, i) => ({
        ...minuteFixture.topics[0],
        number: i + 1,
        description:
          "Se revisó la planificación, las áreas involucradas y las acciones de seguimiento. ".repeat(
            15,
          ),
      })),
    });
    expect(extended.equals(base)).toBe(false);
    expect(
      (extended.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length,
    ).toBeGreaterThan(1);
  }, 20000);
});
