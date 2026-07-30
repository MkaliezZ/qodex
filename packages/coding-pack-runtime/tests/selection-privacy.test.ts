import { describe, expect, it } from "vitest";
import {
  selectCodingPackSources,
  type CodingPackCandidateInput,
  type CodingPackSelectionInput,
} from "../src/index.js";
import { rules } from "./helpers.js";

const encoder = new TextEncoder();

function candidate(
  relativePath: string,
  options: Partial<Omit<CodingPackCandidateInput, "relativePath" | "bytes">> = {},
  text = "portable source",
): CodingPackCandidateInput {
  return {
    relativePath,
    bytes: encoder.encode(text),
    originCode: "project_default",
    ...options,
  };
}

function select(candidates: readonly CodingPackCandidateInput[]) {
  const input: CodingPackSelectionInput = {
    purpose: "task_context",
    selectionRules: rules(),
    candidates,
  };
  return selectCodingPackSources(input);
}

describe("Coding Pack hard privacy exclusions", () => {
  it.each([
    [".git/config", "hard_private_path"],
    [".svn/entries", "hard_private_path"],
    [".hg/store/data", "hard_private_path"],
    ["node_modules/pkg/index.js", "vendor_directory"],
    ["vendor/pkg/index.ts", "vendor_directory"],
    ["dist/index.js", "generated_directory"],
    ["build/output.js", "generated_directory"],
    ["coverage/report.json", "generated_directory"],
    ["target/debug/app", "generated_directory"],
    ["src/__pycache__/module.pyc", "generated_directory"],
    [".pytest_cache/state", "generated_directory"],
    [".next/server.js", "generated_directory"],
    [".nuxt/app.js", "generated_directory"],
  ])("classifies %s as %s", async (relativePath, reasonCode) => {
    const result = await select([candidate(relativePath)]);
    expect(result.included).toEqual([]);
    expect(result.exclusions).toEqual([{ relativePath, reasonCode }]);
  });

  it.each([
    ".env",
    ".env.local",
    "config/private.pem",
    "config/private.KEY",
    "id_rsa",
    "id_dsa",
    "id_ed25519",
    "config/credentials.json",
    "config/service-account-prod.json",
    ".npmrc",
    ".pypirc",
    "netrc",
  ])("excludes credential-like path %s", async (relativePath) => {
    const result = await select([candidate(relativePath)]);
    expect(result.exclusions).toEqual([
      { relativePath, reasonCode: "credential_like_name" },
    ]);
  });

  it("does not let explicit selection or purpose origin override hard deny", async () => {
    const result = await select([
      candidate(".env", { originCode: "explicit_selection" }),
      candidate("keys/private.pem", { originCode: "purpose_rule" }),
      candidate("node_modules/pkg/index.js", { originCode: "explicit_selection" }),
    ]);

    expect(result.included).toEqual([]);
    expect(result.exclusions).toEqual([
      { relativePath: ".env", reasonCode: "credential_like_name" },
      { relativePath: "keys/private.pem", reasonCode: "credential_like_name" },
      { relativePath: "node_modules/pkg/index.js", reasonCode: "vendor_directory" },
    ]);
  });

  it("applies explicit and fixed project-ignore decisions without overrides", async () => {
    const result = await select([
      candidate("docs/draft.md", { explicitlyExcluded: true }),
      candidate("generated/api.ts", { ignoredByProjectRules: true }),
      candidate("notes/local.txt", { ignoredByProjectRules: true }),
    ]);

    expect(result.exclusions).toEqual([
      { relativePath: "docs/draft.md", reasonCode: "explicit_exclusion" },
      { relativePath: "generated/api.ts", reasonCode: "project_ignore" },
      { relativePath: "notes/local.txt", reasonCode: "project_ignore" },
    ]);
  });

  it("rejects attempts to spoof classifier provenance", async () => {
    await expect(select([
      {
        ...candidate("src/a.ts", { ignoredByProjectRules: true }),
        projectIgnoreReasonCode: "hard_private_path",
      } as CodingPackCandidateInput,
    ])).rejects.toThrow(/unsupported field/u);
  });
});

describe("Coding Pack path collision policy", () => {
  it("fails closed for Windows-oriented case collisions", async () => {
    await expect(select([
      candidate("README.md"),
      candidate("readme.md"),
    ])).rejects.toMatchObject({ code: "path_collision" });
  });

  it("fails closed for macOS-oriented NFC-equivalent paths", async () => {
    await expect(select([
      candidate("src/é.ts"),
      candidate("src/e\u0301.ts"),
    ])).rejects.toMatchObject({ code: "path_collision" });
  });

  it("accepts distinct valid non-BMP paths in UTF-8 byte order", async () => {
    const result = await select([
      candidate("src/𐐷.ts"),
      candidate("src/😀.ts"),
    ]);

    expect(result.included.map((entry) => entry.relativePath)).toEqual([
      "src/𐐷.ts",
      "src/😀.ts",
    ]);
  });
});

describe("Coding Pack portable selection privacy", () => {
  it.each([
    "/Users/example/private-project/source.ts",
    "C:\\Users\\example\\private-project\\source.ts",
    `src/sha256:${"a".repeat(64)}.txt`,
  ])("rejects structurally non-portable path %s", async (relativePath) => {
    await expect(select([candidate(relativePath)])).rejects.toThrow();
  });

  it.each([
    "src/projectFingerprint.ts",
    "src/project-0123456789abcdef.ts",
    "docs/destinationHandle.md",
    "src/privateRootPath.ts",
    "fixtures/sha256-aaaaaaaa.txt",
  ])("accepts legitimate relative filename %s without keyword filtering", async (relativePath) => {
    const result = await select([candidate(relativePath)]);
    expect(result.included.map((entry) => entry.relativePath)).toEqual([relativePath]);
  });

  it.each([
    "src/name:variant.ts",
    "src/name*.ts",
    "src/name?.ts",
    "con",
    "CON.txt",
    "src/AUX.md",
    "logs/LPT1.log",
    "src/trailing.",
    "src/trailing ",
    `src/${"é".repeat(128)}.ts`,
  ])("rejects non-portable filename %s", async (relativePath) => {
    await expect(select([candidate(relativePath)])).rejects.toMatchObject({
      code: "invalid_path",
    });
  });

  it("does not serialize source contents or ambient authority sentinels", async () => {
    const privateValues = [
      "/Users/example/private-project",
      "C:\\Users\\example\\private-project",
      "project-0123456789abcdef",
      `sha256:${"a".repeat(64)}`,
      "destination-handle-private",
      "PRIVATE_SECRET_MATCH_VALUE",
    ];
    const result = await select([
      candidate("src/index.ts", { originCode: "explicit_selection" }, privateValues.join("\n")),
    ]);
    const serialized = JSON.stringify(result);

    for (const privateValue of privateValues) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(serialized).not.toContain("portable source");
    expect(serialized).not.toContain("projectBindingId");
    expect(serialized).not.toContain("destinationHandle");
  });
});
