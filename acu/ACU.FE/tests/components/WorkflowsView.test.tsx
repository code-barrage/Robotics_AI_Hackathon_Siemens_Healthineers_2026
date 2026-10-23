import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "../../src/i18n/I18nProvider";
import type { Workflow } from "../../src/types";

const workflowApi = vi.hoisted(() => ({
  getAssignments: vi.fn(),
  setAssignment: vi.fn(),
  clearAssignment: vi.fn(),
}));
vi.mock("../../src/api/workflowApi", () => ({ workflowApi }));

import WorkflowsView from "../../src/features/workflows/WorkflowsView";

const renderWithI18n = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

function workflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: "wf-1",
    name: "Patient Journey",
    description: "Guide the patient",
    data_entry: { destination_categories: [], destination_names: ["Reception"] },
    steps: [{ type: "finished", status_event: "workflow_completed" }],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("WorkflowsView", () => {
  const onSave = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    workflowApi.getAssignments.mockResolvedValue({});
  });

  function renderView(workflows: Workflow[]) {
    return renderWithI18n(
      <WorkflowsView
        workflows={workflows}
        devices={[]}
        onSave={onSave}
        onDelete={onDelete}
      />
    );
  }

  it("shows an empty state when there are no workflows", () => {
    renderView([]);
    expect(screen.getByText(/no workflows yet/i)).toBeInTheDocument();
  });

  it("lists a workflow card", () => {
    renderView([workflow()]);
    expect(screen.getByText("Patient Journey")).toBeInTheDocument();
  });

  it("expands a workflow card to reveal actions", () => {
    renderView([workflow()]);
    fireEvent.click(screen.getByText("Patient Journey"));
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("fires onDelete when Delete is clicked", () => {
    renderView([workflow()]);
    fireEvent.click(screen.getByText("Patient Journey"));
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith("wf-1");
  });

  it("opens the create-workflow modal from the FAB", () => {
    renderView([]);
    fireEvent.click(screen.getByRole("button", { name: /create new workflow/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
