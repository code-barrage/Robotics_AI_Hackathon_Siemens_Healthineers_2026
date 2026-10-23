import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

function startSimulator(deviceId: string, mac: string) {
  const child = spawn(
    "dotnet",
    [
      "run",
      "--project",
      "../tests/simulator/RobotSimulator/RobotSimulator.csproj",
      "-p:Platform=AnyCPU",
      "--",
      "--acu",
      "http://localhost:3000",
      "--device-id",
      deviceId,
      "--name",
      "Simulated Robot",
      "--mac",
      mac,
      "--step-delay",
      "0.5",
      "--keep-alive",
      "true",
    ],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
  );

  let stdout = "";
  child.stdout?.on("data", (b) => { stdout += String(b); });
  child.stderr?.on("data", (b) => { stdout += String(b); });
  child.on("error", (error) => { stdout += `\nSimulator launch failed: ${error.message}`; });

  return { child, getLogs: () => stdout };
}

async function ensureWorkflowAndAssignment(baseURL: string, deviceId: string) {
  const wf = {
    id: `wf-${deviceId}`,
    name: "E2E Live Journey",
    description: "",
    data_entry: {
      destination_categories: ["", ""],
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

  const created = await fetch(`${baseURL}/api/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(wf),
  });
  expect(created.ok, `Create workflow: HTTP ${created.status}: ${await created.text()}`).toBeTruthy();

  const assigned = await fetch(`${baseURL}/api/workflows/assignments/${deviceId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflowId: wf.id }),
  });
  expect(assigned.ok, `Assign workflow: HTTP ${assigned.status}: ${await assigned.text()}`).toBeTruthy();
}

test("simulator drives live workflow progress in the UI", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const id = randomUUID();
  const deviceId = `sim-${id}`;
  const mac = `02:${id.replaceAll("-", "").slice(0, 10).match(/../g)!.join(":")}`;
  const sim = startSimulator(deviceId, mac);

  try {
    await expect.poll(() => {
      if (sim.child.exitCode !== null || sim.child.signalCode !== null
        || sim.getLogs().includes("Simulator launch failed:")) {
        throw new Error(`Simulator stopped before registration:\n${sim.getLogs()}`);
      }
      return sim.getLogs().includes(`Registered ${deviceId}`);
    }, { timeout: 60_000, message: "Simulator must register before operator approval" }).toBeTruthy();

    await page.goto("/");

    await page.getByRole("button", { name: "Requests" }).first().click();
    const simCard = page.locator("article", { hasText: deviceId });
    await expect(simCard).toBeVisible({ timeout: 20_000 });
    await simCard.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(async () => {
      const response = await fetch(`http://localhost:3000/api/bot/registration-status/${deviceId}`);
      expect(response.ok, `Registration status: HTTP ${response.status}`).toBeTruthy();
      return (await response.json()).status;
    }, { timeout: 20_000 }).toBe("approved");

    await ensureWorkflowAndAssignment(baseURL!, deviceId);
    await page.reload();

    await page.getByRole("button", { name: "Devices" }).first().click();
    await page.locator(".device-row", { hasText: deviceId }).click();

    const progress = page.locator(".dest-flow");
    await expect(progress.getByText("Reception", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(progress.getByText("Ward", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(progress.getByText("Workflow Complete", { exact: true })).toHaveClass(/reached/, { timeout: 30_000 });

    await expect
      .poll(() => sim.getLogs().includes("workflow_completed"), { timeout: 30_000 })
      .toBeTruthy();
  } finally {
    if (!sim.child.killed) sim.child.kill("SIGTERM");
  }
});
