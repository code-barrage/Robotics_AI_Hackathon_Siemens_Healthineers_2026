import { expect, test } from "@playwright/test";

async function registerPendingDevice(baseURL: string, deviceId: string) {
  const res = await fetch(`${baseURL}/api/bot/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId,
      name: `E2E ${deviceId}`,
      ip: "192.168.50.10",
      mac: `AA:BB:CC:${deviceId.slice(-2)}:10:99`,
      firmware: "e2e-1.0",
    }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`register failed (${res.status})`);
  }
}

test("app loads and shows top-level navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Devices" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Requests" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Workflows" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" }).first()).toBeVisible();
});

test("operator can approve a pending device request", async ({ page, baseURL }) => {
  const id = `e2e-req-${Date.now()}`;
  await registerPendingDevice(baseURL!, id);

  await page.goto("/");
  await page.getByRole("button", { name: "Requests" }).first().click();

  await expect(page.getByText(`E2E ${id}`)).toBeVisible({ timeout: 20_000 });
  await page.locator("article", { hasText: `E2E ${id}` }).getByRole("button", { name: "Approve" }).click();

  await page.getByRole("button", { name: "Devices" }).first().click();
  await expect(page.getByText(`E2E ${id}`)).toBeVisible({ timeout: 20_000 });
});

test("operator can create a workflow from the workflows view", async ({ page }) => {
  const workflowName = `E2E Workflow ${Date.now()}`;

  await page.goto("/");
  await page.getByRole("button", { name: "Workflows" }).first().click();

  await page.getByRole("button", { name: "Create new workflow" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByPlaceholder("e.g. Standard Patient Scan").fill(workflowName);
  await page.getByPlaceholder("Describe the purpose of this workflow").fill("Created by Playwright E2E");

  await page.getByRole("button", { name: "Add Step" }).click();
  await page.locator(".workflow-destination-block").nth(1).locator("select").first().selectOption("finished");

  await page.getByRole("dialog").getByRole("button", { name: "Create Workflow", exact: true }).click();
  await expect(page.getByText(workflowName)).toBeVisible({ timeout: 20_000 });
});
