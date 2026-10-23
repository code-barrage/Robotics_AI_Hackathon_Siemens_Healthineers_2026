import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "../../src/i18n/I18nProvider";
import type { RegisteredDevice, Workflow } from "../../src/types";

const workflowApi = vi.hoisted(() => ({
  getAssignments: vi.fn(),
  setAssignment: vi.fn(),
  clearAssignment: vi.fn(),
}));
vi.mock("../../src/api/workflowApi", () => ({ workflowApi }));

import DevicesView from "../../src/features/devices/DevicesView";

const renderWithI18n = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

function workflow(): Workflow {
  return {
    id: "wf-1",
    name: "Patient Journey",
    description: "",
    data_entry: {
      destination_categories: [],
      destination_names: ["Reception", "Ward"],
    },
    steps: [
      { type: "follow_me", destination: "{{destinations[0]}}", duration_ms: 0 },
      { type: "confirmation", status_event: "patient_reached_reception" },
      { type: "follow_me", destination: "{{destinations[1]}}", duration_ms: 0 },
      { type: "confirmation", status_event: "patient_reached_ward" },
      { type: "finished", status_event: "workflow_completed" },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function device(overrides: Partial<RegisteredDevice> = {}): RegisteredDevice {
  return {
    id: "d1",
    deviceName: "Ward Bot",
    deviceId: "robot-001",
    deviceType: "mobile-robot",
    ipAddress: "192.168.1.42",
    macAddress: "AA:BB:CC:DD:EE:FF",
    connectedAt: "2026-01-01T00:00:00Z",
    lastSeen: "2026-01-01T00:00:00Z",
    isOnline: true,
    ...overrides,
  };
}

const noop = () => {};

describe("DevicesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workflowApi.getAssignments.mockResolvedValue({});
  });

  function renderView(devices: RegisteredDevice[], workflows: Workflow[]) {
    return renderWithI18n(
      <DevicesView
        devices={devices}
        pendingRequests={[]}
        onApprove={noop}
        onDeny={noop}
        onUnregister={noop}
        loadingId={null}
        unregisteringId={null}
        workflows={workflows}
      />
    );
  }

  it("lists registered devices", () => {
    renderView([device()], []);
    expect(screen.getByText("Ward Bot")).toBeInTheDocument();
    expect(screen.getByText("robot-001")).toBeInTheDocument();
  });

  it("shows an empty state when there are no devices", () => {
    renderView([], []);
    expect(screen.getByText(/no registered devices/i)).toBeInTheDocument();
  });

  it("opens device detail when a device row is clicked", () => {
    renderView([device()], []);
    fireEvent.click(screen.getByText("Ward Bot"));
    expect(screen.getByRole("tab", { name: /workflow/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /about/i })).toBeInTheDocument();
  });

  it("renders the workflow progress dots for the assigned workflow", () => {
    const dev = device({
      assignedWorkflowId: "wf-1",
      eventQueue: [
        { event: "workflow_started", receivedAt: "" },
        { event: "patient_reached_reception", receivedAt: "" },
      ],
    });
    renderView([dev], [workflow()]);
    fireEvent.click(screen.getByText("Ward Bot"));

    expect(screen.getByText("Reception")).toBeInTheDocument();
    expect(screen.getByText("Ward")).toBeInTheDocument();
    expect(screen.getByText("Workflow Complete")).toBeInTheDocument();
  });

  it("marks a reached stop and leaves later stops pending", () => {
    const dev = device({
      assignedWorkflowId: "wf-1",
      eventQueue: [
        { event: "workflow_started", receivedAt: "" },
        { event: "patient_reached_reception", receivedAt: "" },
      ],
    });
    renderView([dev], [workflow()]);
    fireEvent.click(screen.getByText("Ward Bot"));

    expect(screen.getByText("Reception").className).toContain("reached");
    expect(screen.getByText("Ward").className).not.toContain("reached");
  });

  it("marks the completion cap reached once every stop is done", () => {
    const dev = device({
      assignedWorkflowId: "wf-1",
      eventQueue: [
        { event: "workflow_started", receivedAt: "" },
        { event: "patient_reached_reception", receivedAt: "" },
        { event: "patient_reached_ward", receivedAt: "" },
      ],
    });
    renderView([dev], [workflow()]);
    fireEvent.click(screen.getByText("Ward Bot"));

    expect(screen.getByText("Workflow Complete").className).toContain("reached");
  });
});
