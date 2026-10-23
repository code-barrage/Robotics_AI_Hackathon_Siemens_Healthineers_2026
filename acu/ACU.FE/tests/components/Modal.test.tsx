import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Modal from "../../src/components/ui/Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <Modal open={false} title="Hidden" onClose={() => {}}>
        <p>Body</p>
      </Modal>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title and children when open", () => {
    render(
      <Modal open title="Assign Workflow" onClose={() => {}}>
        <p>Pick one</p>
      </Modal>
    );
    expect(screen.getByRole("dialog", { name: "Assign Workflow" })).toBeInTheDocument();
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="X" onClose={onClose}>
        <p>Body</p>
      </Modal>
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the overlay is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="X" onClose={onClose}>
        <p>Body</p>
      </Modal>
    );
    // The overlay is the presentation wrapper around the dialog.
    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the dialog body is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="X" onClose={onClose}>
        <p>Body</p>
      </Modal>
    );
    fireEvent.click(screen.getByText("Body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders a footer when provided", () => {
    render(
      <Modal open title="X" onClose={() => {}} footer={<button>Save</button>}>
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
