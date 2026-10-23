import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Workflow } from "../../../src/types";

// Mock the workflow API the hook imports statically.
const api = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../../../src/api/workflowApi", () => ({ workflowApi: api }));

import { useWorkflows } from "../../../src/hooks/useWorkflows";

function wf(id: string, name = "WF"): Workflow {
  return { id, name, description: "", steps: [] } as unknown as Workflow;
}

describe("useWorkflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getAll.mockResolvedValue([]);
    api.create.mockResolvedValue(undefined);
    api.update.mockResolvedValue(undefined);
    api.remove.mockResolvedValue(undefined);
  });

  it("loads workflows on mount", async () => {
    api.getAll.mockResolvedValue([wf("a"), wf("b")]);
    const { result } = renderHook(() => useWorkflows());

    await waitFor(() => expect(result.current.workflows).toHaveLength(2));
    expect(api.getAll).toHaveBeenCalledTimes(1);
  });

  it("adds a new workflow optimistically and calls create", async () => {
    const { result } = renderHook(() => useWorkflows());
    await waitFor(() => expect(api.getAll).toHaveBeenCalled());

    await act(async () => { await result.current.saveWorkflow(wf("new")); });

    expect(result.current.workflows.map((w) => w.id)).toContain("new");
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).not.toHaveBeenCalled();
  });

  it("updates an existing workflow instead of creating it", async () => {
    api.getAll.mockResolvedValue([wf("a", "Old")]);
    const { result } = renderHook(() => useWorkflows());
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));

    await act(async () => { await result.current.saveWorkflow(wf("a", "New")); });

    expect(result.current.workflows[0].name).toBe("New");
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.create).not.toHaveBeenCalled();
  });

  it("removes a workflow optimistically and calls remove", async () => {
    api.getAll.mockResolvedValue([wf("a"), wf("b")]);
    const { result } = renderHook(() => useWorkflows());
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    await act(async () => { await result.current.deleteWorkflow("a"); });

    expect(result.current.workflows.map((w) => w.id)).toEqual(["b"]);
    expect(api.remove).toHaveBeenCalledWith("a");
  });

  it("re-syncs from the server when a delete fails", async () => {
    api.getAll.mockResolvedValueOnce([wf("a"), wf("b")]) // initial load
              .mockResolvedValueOnce([wf("a"), wf("b")]); // refresh after failure
    api.remove.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useWorkflows());
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));

    await act(async () => { await result.current.deleteWorkflow("a"); });

    // Optimistic removal is rolled back by the refresh.
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));
    expect(api.getAll).toHaveBeenCalledTimes(2);
  });
});
