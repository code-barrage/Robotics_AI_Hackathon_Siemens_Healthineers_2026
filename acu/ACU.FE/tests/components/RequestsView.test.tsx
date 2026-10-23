import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "../../src/i18n/I18nProvider";
import type { DeviceRequest } from "../../src/types";
import RequestsView from "../../src/features/requests/RequestsView";

const renderWithI18n = (ui: ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

function request(overrides: Partial<DeviceRequest> = {}): DeviceRequest {
  return {
    id: "r1",
    deviceName: "Lobby Bot",
    deviceId: "robot-100",
    ipAddress: "192.168.1.10",
    macAddress: "AA:BB:CC:00:11:22",
    requestedAt: new Date().toISOString(),
    status: "pending",
    deviceType: "mobile-robot",
    ...overrides,
  };
}

describe("RequestsView", () => {
  const onApprove = vi.fn();
  const onDeny = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  function renderView(requests: DeviceRequest[]) {
    return renderWithI18n(
      <RequestsView
        requests={requests}
        onApprove={onApprove}
        onDeny={onDeny}
        loadingId={null}
        lastRefreshed={new Date()}
      />
    );
  }

  it("shows an empty state when there are no requests", () => {
    renderView([]);
    expect(screen.getByText(/no requests/i)).toBeInTheDocument();
  });

  it("lists a request card", () => {
    renderView([request()]);
    expect(screen.getByText("Lobby Bot")).toBeInTheDocument();
    expect(screen.getByText("robot-100")).toBeInTheDocument();
  });

  it("fires onApprove when Approve is clicked", () => {
    renderView([request()]);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledWith("r1");
  });

  it("fires onDeny when Deny is clicked", () => {
    renderView([request()]);
    fireEvent.click(screen.getByRole("button", { name: /deny/i }));
    expect(onDeny).toHaveBeenCalledWith("r1");
  });

  it("hides action buttons for non-pending requests", () => {
    renderView([request({ status: "approved" })]);
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deny/i })).not.toBeInTheDocument();
  });

  it("filters the list when a status filter is selected", () => {
    renderView([
      request({ id: "r1", deviceName: "Pending Bot", status: "pending" }),
      request({ id: "r2", deviceName: "Approved Bot", status: "approved" }),
    ]);
    fireEvent.click(screen.getByRole("tab", { name: /approved/i }));
    expect(screen.getByText("Approved Bot")).toBeInTheDocument();
    expect(screen.queryByText("Pending Bot")).not.toBeInTheDocument();
  });
});
