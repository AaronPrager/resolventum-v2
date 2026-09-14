import { expect, test } from "@playwright/test";

test("enable the calendar feed and fetch it without a session", async ({ page, request }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /Enable feed|Regenerate link/ }).click();
  const box = page.getByTestId("feed-url");
  await expect(box).toBeVisible();
  const url = (await box.locator("code").textContent())!.trim();
  expect(url).toMatch(/\/api\/calendar\/[A-Za-z0-9_-]+\.ics$/);

  const res = await request.get(url, { headers: { cookie: "" } });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const body = await res.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("Victoria Li");

  await page.locator("section", { hasText: "Calendar feed" }).getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("Not enabled.")).toBeVisible();
  const after = await request.get(url);
  expect(after.status()).toBe(404);
});
