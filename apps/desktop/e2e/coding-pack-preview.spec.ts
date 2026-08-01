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

test.describe("KerniQ v0.7.4.3 Coding Pack preview, decision, and export boundary", () => {
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
    await expect(preview.getByTestId("coding-pack-destination")).toBeDisabled();
    await expect(preview.getByTestId("coding-pack-create-proposal")).toBeDisabled();

    const confirm = preview.getByTestId("coding-pack-confirm");
    await confirm.focus();
    await expect(confirm).toBeFocused();
    await confirm.press("Enter");
    await expect(preview.getByTestId("coding-pack-state")).toHaveText("Confirmed");
    await expect(preview.getByText("Exact preview confirmed")).toBeVisible();
    await expect(preview.getByTestId("coding-pack-destination")).toBeEnabled();

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

  test("durably proposes and confirms export intent without writing destination files", async ({ page }) => {
    await installProjectFixture(page, projectFiles);
    await setupApp(page);
    await page.getByRole("button", { name: "Open Project" }).click();
    await page.getByRole("button", { name: "Files" }).click();
    await page.locator('button[title="src/math.ts"]').click();

    const preview = page.getByTestId("coding-pack-preview");
    await preview.getByRole("button", { name: "Create Coding Pack preview" }).click();
    await preview.getByTestId("coding-pack-confirm").click();
    const exportIntent = preview.getByTestId("coding-pack-export-intent");
    await expect(exportIntent.getByText("No files written")).toBeVisible();
    await expect(exportIntent.getByText("Export has not started")).toBeVisible();

    const destinationButton = preview.getByTestId("coding-pack-destination");
    await destinationButton.focus();
    await expect(destinationButton).toBeFocused();
    await destinationButton.press("Enter");
    await expect(exportIntent.getByText("kerniq-smoke")).toBeVisible();

    const createProposal = preview.getByTestId("coding-pack-create-proposal");
    await expect(createProposal).toBeEnabled();
    await createProposal.click();
    await expect(exportIntent.getByText("Export proposal created")).toBeVisible();
    await expect(exportIntent.getByText("Proposal digest")).toBeVisible();
    await expect(exportIntent.getByText("Expires")).toBeVisible();

    const confirmProposal = preview.getByTestId("coding-pack-confirm-proposal");
    await confirmProposal.focus();
    await expect(confirmProposal).toBeFocused();
    await confirmProposal.press("Enter");
    await expect(exportIntent.getByText("Export proposal confirmed")).toBeVisible();
    await expect(confirmProposal).toBeDisabled();
    await expect(confirmProposal).toHaveText("Proposal confirmed");

    const evaluatePolicy = preview.getByTestId("coding-pack-evaluate-policy");
    await expect(evaluatePolicy).toBeEnabled();
    await evaluatePolicy.click();
    await expect(preview.getByTestId("coding-pack-policy-result")).toContainText(
      "Policy allowed",
    );
    await expect(preview.getByTestId("coding-pack-policy-result")).toContainText(
      "Export has not started",
    );
    await expect(exportIntent.getByText(
      "Native Desktop required for atomic export",
    )).toBeVisible();
    await expect(preview.getByTestId("coding-pack-export")).toHaveCount(0);

    await expect(page.locator("body")).not.toContainText("browser://");
    await expect(page.locator("body")).not.toContainText(projectFiles["src/math.ts"]);
    await expect(exportIntent).not.toContainText("Exported");
    await expect(exportIntent).not.toContainText("Completed");
    expect((await readProjectFixture(page)).writes).toBe(0);

    await page.reload();
    await page.getByRole("button", { name: "Files" }).click();
    const recovered = page.getByTestId("coding-pack-recovered-operation");
    await expect(recovered.getByText("Export proposal decided_allow")).toBeVisible();
    await expect(recovered.getByText("No files written")).toBeVisible();
    await expect(recovered.getByText("No decision or export was resumed")).toBeVisible();
    await expect(recovered.getByText("Historical decision: Policy allowed")).toBeVisible();
    await expect(page.getByTestId("coding-pack-evaluate-policy")).toHaveCount(0);
    await expect(recovered.getByText("browser destination capability is unavailable")).toBeVisible();
    await expect(page.getByText("Exact preview confirmed")).toHaveCount(0);
    await expect(recovered.getByTestId("coding-pack-export")).toHaveCount(0);
  });
});
