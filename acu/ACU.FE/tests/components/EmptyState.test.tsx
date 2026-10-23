import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EmptyState from "../../src/components/ui/EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByRole("heading", { name: "Nothing here" })).toBeInTheDocument();
  });

  it("shows the description when provided", () => {
    render(<EmptyState title="Empty" description="No devices yet" />);
    expect(screen.getByText("No devices yet")).toBeInTheDocument();
  });

  it("omits the description when not provided", () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByText(/No devices/)).not.toBeInTheDocument();
  });

  it("renders an action element when given", () => {
    const onClick = vi.fn();
    render(
      <EmptyState title="Empty" action={<button onClick={onClick}>Add</button>} />
    );
    const btn = screen.getByRole("button", { name: "Add" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
