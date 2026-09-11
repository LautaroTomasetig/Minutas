import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MinuteResult } from "./MinuteResult";
import { minuteFixture } from "@/tests/fixtures/meeting";

function Harness() {
  const [minute, setMinute] = useState(minuteFixture);
  return <MinuteResult minute={minute} onChange={setMinute} />;
}
describe("MinuteResult", () => {
  it("presenta puntos, responsables y estados", () => {
    render(<Harness />);
    const first = screen.getByRole("article", { name: /punto 1/i });
    expect(within(first).getByText("Luis García")).toBeInTheDocument();
    expect(within(first).getByText("Cerrado")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Próxima entrega" }),
    ).toBeInTheDocument();
  });
  it("aplica cambios de texto, responsable y estado", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Editar punto 1" }));
    await user.clear(screen.getByLabelText("Título del punto"));
    await user.type(
      screen.getByLabelText("Título del punto"),
      "Prototipo aprobado",
    );
    await user.clear(screen.getByLabelText("Responsable"));
    await user.type(screen.getByLabelText("Responsable"), "Ana Pérez");
    await user.selectOptions(screen.getByLabelText("Estado"), "pending");
    await user.click(screen.getByRole("button", { name: "Aplicar cambios" }));
    const first = screen.getByRole("article", { name: /punto 1/i });
    expect(within(first).getByText("Ana Pérez")).toBeInTheDocument();
    expect(within(first).getByText("Pendiente")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Prototipo aprobado" }),
    ).toBeInTheDocument();
  });
  it("descarta una edición cancelada y permite agregar puntos", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Editar punto 1" }));
    await user.clear(screen.getByLabelText("Título del punto"));
    await user.click(screen.getByRole("button", { name: "Cancelar edición" }));
    expect(
      screen.getByRole("heading", { name: "Revisión del prototipo" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agregar punto" }));
    await user.type(screen.getByLabelText("Título del punto"), "Seguimiento");
    await user.type(
      screen.getByLabelText("Descripción"),
      "Se revisará en la siguiente reunión.",
    );
    await user.click(screen.getByRole("button", { name: "Aplicar cambios" }));
    expect(
      screen.getByRole("article", { name: "Punto 3: Seguimiento" }),
    ).toBeInTheDocument();
  });
});
