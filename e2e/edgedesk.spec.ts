import { expect, test } from "@playwright/test";
import {
  chooseDifferentAssignee,
  fileRequest,
  loginAs,
  logout,
  waitForAgentDone,
} from "./helpers";

const EMPLOYEE = "ada.lovelace@edgedesk.test";
const OPS = "priya.raman@edgedesk.test";

test("1. file an equipment request and watch the agent finish triage", async ({ page }) => {
  await loginAs(page, EMPLOYEE);
  const { url } = await fileRequest(
    page,
    "E2E equipment: laptop failed before demo",
    "My laptop will not boot and I have a customer demo in one hour. I need a replacement laptop.",
  );

  await waitForAgentDone(page);

  const header = page.locator(".detail-header");
  await expect(header.getByText("Equipment", { exact: true })).toBeVisible();
  await expect(header.getByText("P0 · Critical", { exact: true })).toBeVisible();
  await expect(page.getByTestId("request-assignee")).not.toHaveText("Unassigned");
  await expect(page.getByTestId("request-due")).not.toHaveText("—");

  const toolSteps = page.locator(".run-step--tool");
  expect(await toolSteps.count()).toBeGreaterThanOrEqual(4);
  const stepNames = await page.getByTestId("agent-step-name").allInnerTexts();
  expect(stepNames).toEqual(
    expect.arrayContaining(["classify_request", "estimate_priority", "assign_owner"]),
  );
  await expect(page.getByTestId("agent-timeline")).toContainText("post_resolution_draft");
  expect(url).toContain("/requests/");
});

test("2. queue filters by status and category match seeded counts", async ({ page }) => {
  await loginAs(page, EMPLOYEE);

  await expect(page.getByTestId("status-count-resolved")).toContainText("24");

  await page.getByTestId("filter-status").selectOption("resolved");
  await expect(page.getByTestId("queue-total")).toHaveText("24 requests");
  await expect(page.getByTestId("queue-page")).toHaveText("Page 1 of 3");
  expect(await page.getByTestId("queue-row").count()).toBe(10);

  await page.getByTestId("filter-category").selectOption("payroll");
  await expect(page.getByTestId("queue-total")).toHaveText("5 requests");
  await expect(page.getByTestId("queue-row")).toHaveCount(5);

  await page.getByTestId("filter-status").selectOption("");
  await expect(page.getByTestId("queue-total")).toHaveText("10 requests");
  await expect(page.getByTestId("queue-row")).toHaveCount(10);
});

test("3. people_ops can assign and resolve; employee gets a 403 UI error", async ({ page }) => {
  await loginAs(page, EMPLOYEE);
  const { url } = await fileRequest(
    page,
    "E2E ops flow: monitor for pairing",
    "I need a second monitor for pair programming this week.",
  );
  await waitForAgentDone(page);
  await logout(page);

  await loginAs(page, OPS);
  await page.goto(url);
  await waitForAgentDone(page);

  await chooseDifferentAssignee(page);
  await page.getByTestId("assign-submit").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Assignee updated" })).toBeVisible();

  await page.getByTestId("resolve-textarea").fill("Monitor shipped to the requester.");
  await page.getByTestId("resolve-submit").click();
  await expect(page.getByText("Request resolved", { exact: true })).toBeVisible();
  await expect(page.getByTestId("request-resolution")).toContainText(
    "Monitor shipped to the requester.",
  );
  await logout(page);

  await loginAs(page, EMPLOYEE);
  await page.goto(url);
  await waitForAgentDone(page);
  await chooseDifferentAssignee(page);
  await page.getByTestId("assign-submit").click();
  await expect(page.getByTestId("toast").filter({ hasText: "403" })).toBeVisible();
  await expect(page.getByTestId("toast").filter({ hasText: "permission" })).toBeVisible();
});

test("4. validation errors render inline and block submission", async ({ page }) => {
  await loginAs(page, EMPLOYEE);
  const before = (await (await page.request.get("/api/requests?limit=1")).json()) as {
    total: number;
  };

  await page.goto("/new");
  await page.getByTestId("request-submit").click();

  await expect(page.getByText("Title must be at least 3 characters")).toBeVisible();
  await expect(
    page.getByText("Describe the request in at least 10 characters"),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/new$/);

  await page.getByTestId("request-title").fill("ab");
  await page.getByTestId("request-body").fill("short");
  await page.getByTestId("request-submit").click();
  await expect(page.getByText("Title must be at least 3 characters")).toBeVisible();
  await expect(page).toHaveURL(/\/new$/);

  const after = (await (await page.request.get("/api/requests?limit=1")).json()) as {
    total: number;
  };
  expect(after.total).toBe(before.total);
});

test("5. audit timeline shows created -> triaged -> assigned -> resolved", async ({ page }) => {
  await loginAs(page, EMPLOYEE);
  const { url } = await fileRequest(
    page,
    "E2E audit: headset replacement",
    "My headset microphone is broken and I cannot join customer calls this week.",
  );
  await waitForAgentDone(page);
  await logout(page);

  await loginAs(page, OPS);
  await page.goto(url);
  await waitForAgentDone(page);
  await page.getByTestId("resolve-textarea").fill("Replacement headset delivered.");
  await page.getByTestId("resolve-submit").click();
  await expect(page.getByTestId("audit-action").last()).toHaveText(
    "Resolved by People-Ops",
  );

  const actions = await page.getByTestId("audit-action").allInnerTexts();
  const expected = [
    "Request created",
    "Triaged by agent",
    "Assigned by agent",
    "Resolved by People-Ops",
  ];
  let matched = 0;
  for (const action of actions) {
    if (action === expected[matched]) matched += 1;
    if (matched === expected.length) break;
  }
  expect(matched).toBe(expected.length);
});

test("6. the SSE stream renders at least four tool steps with non-zero ms", async ({
  page,
}) => {
  await loginAs(page, EMPLOYEE);
  const { id } = await fileRequest(
    page,
    "E2E SSE: docking station",
    "I need a USB-C docking station for my laptop. It can wait until next week.",
  );
  await waitForAgentDone(page);

  const toolSteps = page.locator(".run-step--tool");
  expect(await toolSteps.count()).toBeGreaterThanOrEqual(4);
  const msValues = await page.locator(".run-step--tool [data-testid='agent-step-ms']").allInnerTexts();
  expect(msValues.length).toBeGreaterThanOrEqual(4);
  for (const value of msValues) {
    const parsed = Number.parseInt(value, 10);
    expect(parsed).toBeGreaterThan(0);
  }

  const stream = await page.evaluate(async (streamUrl) => {
    const response = await fetch(streamUrl, { headers: { accept: "text/event-stream" } });
    return { status: response.status, text: await response.text() };
  }, `/api/requests/${id}/run/stream`);

  expect(stream.status).toBe(200);
  expect(stream.text).toContain("event: done");
  const stepEvents = stream.text.match(/event: step/g) ?? [];
  expect(stepEvents.length).toBeGreaterThanOrEqual(4);

  const toolPayloads = stream.text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => {
      try {
        return JSON.parse(line.slice(6)) as { kind?: string; ms?: number };
      } catch {
        return null;
      }
    })
    .filter((payload): payload is { kind: string; ms: number } =>
      Boolean(payload && payload.kind === "tool"),
    );
  expect(toolPayloads.length).toBeGreaterThanOrEqual(4);
  expect(toolPayloads.every((payload) => (payload.ms ?? 0) > 0)).toBe(true);
});
