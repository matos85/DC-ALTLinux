import { expect, test } from "@playwright/test";

const adminUser = process.env.PLAYWRIGHT_ADMIN_USER ?? "admin";
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? "AdminPanel123!";

test.describe("Панель администратора", () => {
  test("сначала вход, затем доступ к разделам", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/");

    await expect(page.getByText("Проверка сессии…")).toBeHidden({ timeout: 45_000 });
    await expect(page.getByRole("heading", { name: /Вход администратора/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Дашборд" })).toHaveCount(0);

    await page.getByTestId("panel-login-username").fill(adminUser);
    await page.getByTestId("panel-login-password").fill(adminPassword);
    const loginPostPromise = page.waitForResponse(
      (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByTestId("panel-login-submit").click();
    const loginResponse = await loginPostPromise;
    const loginBody = (await loginResponse.json()) as { ok?: boolean; detail?: string };
    expect(loginResponse.ok(), `login HTTP ${loginResponse.status()}`).toBeTruthy();
    expect(loginBody.ok, loginBody.detail ?? "login body").toBe(true);

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Дашборд" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Дашборд" })).toBeVisible();

    await page.getByRole("link", { name: "Пользователи" }).click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole("heading", { name: "Пользователи домена" })).toBeVisible();
    // В стандартном режиме вкладка Pro не регистрируется в tablist (см. PageTabs + is_pro_mode).
    await expect(page.getByRole("tab", { name: "Pro (JSON)" })).toHaveCount(0);

    await page.getByRole("link", { name: "Задачи и аудит" }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByRole("heading", { name: "Задачи и аудит" })).toBeVisible();
  });
});
