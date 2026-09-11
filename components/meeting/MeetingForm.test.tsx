import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MeetingForm } from "./MeetingForm";

describe("MeetingForm", () => {
  it("rechaza campos requeridos vacíos sin iniciar la reunión", async () => {
    const onSubmit = vi.fn();
    render(<MeetingForm onSubmit={onSubmit} />);
    await userEvent.click(
      screen.getByRole("button", { name: /iniciar reunión/i }),
    );
    expect(
      screen.getByText("Ingresá un título para la reunión."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ingresá el nombre del autor."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("valida participantes y entrega los metadatos normalizados", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<MeetingForm onSubmit={onSubmit} />);
    await user.type(
      screen.getByLabelText(/título de la reunión/i),
      "  Planificación  ",
    );
    await user.type(screen.getByLabelText(/autor de la minuta/i), " Ana ");
    await user.click(
      screen.getByRole("button", { name: /agregar participante/i }),
    );
    await user.click(screen.getByRole("button", { name: /iniciar reunión/i }));
    expect(
      screen.getByText("Ingresá un nombre o eliminá la fila."),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Participante 1"), "Luis");
    await user.click(screen.getByRole("button", { name: /iniciar reunión/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Planificación",
        author: "Ana",
        participants: [{ name: "Luis", area: "" }],
      }),
    );
  });
});
