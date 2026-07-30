import { expect, test } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";
import {
  installProjectFixture,
  readProjectFixture,
} from "./fixtures/project-fixture";

const projectFiles = {
  "src/math.ts": "export const add = (a: number, b: number) => a + b;\n",
  "src/value.ts": "export const value = 42;\n",
  "logo.png": "fixture binary-like bytes",
};

test.describe("KerniQ v0.7.3 selected-file Coding Pack preview", () => {
  test("covers no-project, no-selection, confirmation, stale, and keyboard states", async ({ page }) => {
    await installProjectFixture(page, projectFiles, { readDelayMs: 300 });
    await setupApp(page);
    await page.getByRole("button", { name: "Files" }).click();

    const preview = page.getByTestId("coding-pack-preview");
    await expect(preview).toBeVisible();
    await expect(preview.getByText("Open an authorized project")).toBeVisible();
    await expect(preview.getByTestId("coding-pack-purpose")).toBeDisabled();
    await expect(preview.getByRole("button", { name: "Create Coding Pack preview" })).toBeDisabled();

    await page.getByRole("button", { name: "Open Project" }).click();
    await expect(preview.getByText("Select files in the project tree")).toBeVisible();

    const sourceFile = page.locator('button[title="src/math.ts"]');
    await sourceFile.focus();
    await expect(sourceFile).toBeFocused();
    await sourceFile.press("Enter");
    await expect(sourceFile).toHaveClass(/is-selected/);

    const purpose = preview.getByTestId("coding-pack-purpose");
    await purpose.focus();
    await expect(purpose).toBeFocused();
    await purpose.selectOption("task_context");
    await preview.getByRole("button", { name: "Create Coding Pack preview" }).click();
    await expect(preview.getByRole("button", { name: "Reading selected files" })).toBeDisabled();

    await expect(preview.getByTestId("coding-pack-state")).toHaveText("Current");
    await expect(preview.getByTestId("coding-pack-included")).toContainText("src/math.ts");
    await expect(preview.getByText("Source fingerprint")).toBeVisible();
    await expect(preview.getByText("Pack ID")).toBeVisible();
    await expect(preview.getByText("Manifest digest")).toBeVisible();

    const confirm = preview.getByTestId("coding-pack-confirm");
    await confirm.focus();
    await expect(confirm).toBeFocused();
    await confirm.press("Enter");
    await expect(preview.getByTestId("coding-pack-state")).toHaveText("Confirmed");
    await expect(preview.getByText("Exact preview confirmed")).toBeVisible();

    await purpose.selectOption("review_handoff");
    await expect(preview.getByTestId("coding-pack-state")).toHaveText("Stale");
    await expect(confirm).toBeDisabled();
    await expect(preview.getByText("Refresh before confirming")).toBeVisible();

    await preview.getByRole("button", { name: "Refresh Coding Pack preview" }).click();
    await expect(preview.getByTestId("coding-pack-state")).toHaveText("Current");
    await expect(confirm).toBeEnabled();
  });

  test("shows machine exclusions without local authority or filesystem writes", async ({ page }) => {
    await installProjectFixture(page, projectFiles);
    await setupApp(page);
    await page.getByRole("button", { name: "Open Project" }).click();
    await page.getByRole("button", { name: "Files" }).click();

    await page.locator('button[title="src/math.ts"]').click();
    await page.locator('button[title="logo.png"]').click();
    const preview = page.getByTestId("coding-pack-preview");
    await preview.getByRole("button", { name: "Create Coding Pack preview" }).click();

    await expect(preview.getByTestId("coding-pack-included")).toContainText("src/math.ts");
    await expect(preview.getByTestId("coding-pack-exclusions")).toContainText("logo.png");
    await expect(preview.getByTestId("coding-pack-exclusions")).toContainText(
      "binary_like_extension",
    );
    await expect(page.locator("body")).not.toContainText("browser://");
    await expect(page.locator("body")).not.toContainText("projectBindingId");
    await expect(page.locator("body")).not.toContainText("privateRootPath");
    await expect(page.locator("body")).not.toContainText(projectFiles["src/math.ts"]);
    expect((await readProjectFixture(page)).writes).toBe(0);
  });
});
