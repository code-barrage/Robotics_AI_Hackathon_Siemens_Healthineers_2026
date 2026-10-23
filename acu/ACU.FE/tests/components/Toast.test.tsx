import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Toast from "../../src/components/ui/Toast";

describe("Toast", () => {
  it("renders the message inside a polite live region", () => {
    render(<Toast type="success" message="Workflow saved" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Workflow saved");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("applies the success variant class", () => {
    render(<Toast type="success" message="ok" />);
    expect(screen.getByRole("status")).toHaveClass("toast", "success");
  });

  it("applies the error variant class", () => {
    render(<Toast type="error" message="boom" />);
    expect(screen.getByRole("status")).toHaveClass("toast", "error");
  });
});
