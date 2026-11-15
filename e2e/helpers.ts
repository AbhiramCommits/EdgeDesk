import { expect, type Page } from "@playwright/test";

export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByTestId("status-count-all")).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/login");
}

export async function fileRequest(
  page: Page,
  title: string,
  body: string,
): Promise<{ url: string; id: string }> {
  await page.goto("/new");
  await page.getByTestId("request-title").fill(title);
  await page.getByTestId("request-body").fill(body);
  await page.getByTestId("request-submit").click();
  await page.waitForURL(/\/requests\/[0-9a-f-]+$/);
  const url = page.url();
  const id = url.split("/").pop() ?? "";
  await expect(page.getByTestId("request-title")).toHaveText(title);
  return { url, id };
}

export async function waitForAgentDone(page: Page): Promise<void> {
  await expect(page.getByTestId("agent-done")).toContainText("Agent run finished", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("run-status")).toHaveText("done");
}

export async function chooseDifferentAssignee(page: Page): Promise<string> {
  const select = page.getByTestId("assign-select");
  const current = await select.inputValue();
  const values = await select
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter((value) => value.length > 0),
    );
  const target = values.find((value) => value !== current);
  if (!target) throw new Error("No alternate assignee available");
  await select.selectOption(target);
  return target;
}

export function requestIdFromUrl(url: string): string {
  return url.split("/").pop() ?? "";
}
