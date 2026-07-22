import { expect, test } from "@playwright/test";
import { setupApp } from "./fixtures/app-harness";
import {
  configureDeterministicProvider,
  installProjectFixture,
  readProjectFixture,
} from "./fixtures/project-fixture";

const originalFiles = {
  "src/math.ts": "export const add = (a: number, b: number) => a + b;\n",
  "src/math.test.ts": "import { add } from './math';\nvoid add(1, 2);\n",
};

const updatedFiles = {
  "src/math.ts": `${originalFiles["src/math.ts"]}export const divide = (a: number, b: number) => {\n  if (b === 0) throw new Error('Division by zero');\n  return a / b;\n};\n`,
  "src/math.test.ts": "import { add, divide } from './math';\nvoid add(1, 2);\nvoid divide(6, 2);\n",
};

function validModelResponse(): string {
  return `I prepared a guarded divide function and updated the selected test.\n<KERNIQ_PATCH_V1>\n${JSON.stringify({
    version: "1",
    summary: "Add guarded division and update its test",
    files: [
      {
        path: "src/math.ts",
        oldContent: originalFiles["src/math.ts"],
        newContent: updatedFiles["src/math.ts"],
      },
      {
        path: "src/math.test.ts",
        oldContent: originalFiles["src/math.test.ts"],
        newContent: updatedFiles["src/math.test.ts"],
      },
    ],
  })}\n</KERNIQ_PATCH_V1>`;
}

async function openAndSelectFixture(page: Parameters<typeof setupApp>[0]) {
  await page.getByRole("button", { name: "Open Project" }).click();
  await page.getByText("math.ts", { exact: true }).click();
  await page.getByText("math.test.ts", { exact: true }).click();
}

test.describe("KerniQ real patch loop", () => {
  test("valid model patch requires approval, writes real handles, and rolls back", async ({ page }) => {
    await installProjectFixture(page, originalFiles);
    await setupApp(page);
    await configureDeterministicProvider(page, validModelResponse());
    await openAndSelectFixture(page);

    await page.fill('[data-testid="prompt-input"]', "Add a divide function and update the test.");
    await page.click('[data-testid="send-button"]');

    await expect(page.locator('[data-testid="patch-proposal"]')).toBeVisible();
    await expect(page.locator('[data-testid="patch-file"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="agent-timeline"]')).toContainText("I prepared a guarded divide function");
    await expect(page.locator('[data-testid="agent-timeline"]')).not.toContainText("oldContent");
    expect(await readProjectFixture(page)).toEqual({ files: originalFiles, writes: 0 });

    await page.click('[data-testid="apply-patch"]');
    await expect(page.locator('[data-testid="apply-status"]')).toBeVisible();
    expect((await readProjectFixture(page)).files).toEqual(updatedFiles);

    await page.click('[data-testid="rollback-patch"]');
    await expect(page.locator('[data-testid="rollback-status"]')).toBeVisible();
    expect((await readProjectFixture(page)).files).toEqual(originalFiles);
  });

  test("invalid model patch creates no proposal and attempts no write", async ({ page }) => {
    await installProjectFixture(page, originalFiles);
    await setupApp(page);
    await configureDeterministicProvider(
      page,
      "I could not format this safely.\n<KERNIQ_PATCH_V1>{bad json}</KERNIQ_PATCH_V1>",
    );
    await openAndSelectFixture(page);

    await page.fill('[data-testid="prompt-input"]', "Change the files.");
    await page.click('[data-testid="send-button"]');

    await expect(page.locator('[data-testid="patch-error"]')).toContainText("patch_parse_failed");
    await expect(page.locator('[data-testid="patch-proposal"]')).toHaveCount(0);
    expect(await readProjectFixture(page)).toEqual({ files: originalFiles, writes: 0 });
  });
});
