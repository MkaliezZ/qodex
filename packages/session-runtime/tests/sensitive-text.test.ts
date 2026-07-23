import { describe, expect, it } from "vitest";
import {
  InMemorySessionStore,
  SessionRuntime,
  inspectSensitiveText,
  sanitizeSensitiveText,
} from "../src/index.js";

function credentialFixtures() {
  return {
    github: `github_pat_${"A1".repeat(15)}`,
    aws: `AKIA${"A1".repeat(8)}`,
    slack: `xoxb-${"A1".repeat(8)}`,
    google: `AIza${"A1".repeat(17)}A`,
  };
}

describe("bounded sensitive text scanning", () => {
  it.each([
    ["embedded macOS path", "Opened /Users/example/Private/project/file.ts successfully.", "absolute_path"],
    ["embedded Linux path", "Opened /home/example/private/project/file.ts successfully.", "absolute_path"],
    ["embedded Windows path", "Opened C:\\Users\\example\\Private\\file.ts successfully.", "absolute_path"],
    ["UNC path", "Opened \\\\fileserver\\private-share\\report.txt successfully.", "absolute_path"],
    ["file URL", "Opened file:///Users/example/Private/report.txt successfully.", "absolute_path"],
    ["Authorization header", "Authorization: Bearer fixture-value-123456", "credential"],
    ["Cookie header", "Cookie: session=fixture-value-123456", "credential"],
    ["AWS secret assignment", "AWS_SECRET_ACCESS_KEY=fixture-value-123456", "credential"],
    ["generic assignment", "client_secret = fixture-value-123456", "credential"],
  ] as const)("recognises and redacts an %s", (_label, value, kind) => {
    const scan = inspectSensitiveText(value);
    expect(scan.hasSensitiveText).toBe(true);
    expect(scan.kinds).toContain(kind);
    expect(sanitizeSensitiveText(value)).not.toBe(value);
  });

  it("recognises common structured credential formats without keeping their values", () => {
    const values = credentialFixtures();
    const privateKey = [
      "-----BEGIN PRIVATE KEY-----",
      "fixture-material-1234567890",
      "-----END PRIVATE KEY-----",
    ].join("\n");
    for (const value of [...Object.values(values), privateKey]) {
      expect(inspectSensitiveText(value).hasCredential).toBe(true);
      expect(sanitizeSensitiveText(value)).not.toContain(value);
    }
  });

  it("preserves ordinary relative paths and source expressions", () => {
    const safe = [
      "src/components/App.tsx",
      "const token = parser.next();",
      "Use the project-local config directory.",
    ];
    for (const value of safe) {
      expect(inspectSensitiveText(value).hasSensitiveText).toBe(false);
      expect(sanitizeSensitiveText(value)).toBe(value);
    }
  });
});

describe("privacy before persistence and during export", () => {
  it("sanitizes session metadata, ledger text, sensitive patch contents, and exports", async () => {
    const fixtures = credentialFixtures();
    const privatePath = "/Users/example/Private/project/file.ts";
    const store = new InMemorySessionStore();
    const runtime = new SessionRuntime(store);
    await runtime.upsertProjectBinding({
      bindingId: "binding-privacy",
      displayName: `Project at ${privatePath}`,
      privateRootPath: "/Users/example/Private/project",
      projectFingerprint: "privacy-fixture",
      lastOpenedAt: "2026-04-01T00:00:00Z",
    });
    const session = await runtime.createSession({
      id: "privacy-session",
      title: `Investigate ${privatePath} with ${fixtures.github}`,
      projectBindingId: "binding-privacy",
      providerId: `provider-${fixtures.aws}`,
      modelId: `model-${fixtures.slack}`,
    });
    await runtime.appendEntry(session.id, {
      type: "USER_MESSAGE",
      payload: { text: `Read ${privatePath}; Authorization: Bearer fixture-value-123456` },
    });
    await runtime.appendEntry(session.id, {
      type: "MODEL_MESSAGE",
      payload: { text: `Cookie: session=fixture-value-123456; key ${fixtures.google}` },
    });
    await runtime.appendEntry(session.id, {
      type: "TOOL_COMPLETED",
      payload: {
        summary: `Loaded file://${privatePath}`,
        headers: { authorization: "fixture" },
        AWS_SECRET_ACCESS_KEY: "structured-fixture-value",
        client_secret: "structured-fixture-value",
      },
      safeMetadata: { runtimeStatus: `Finished ${privatePath}` },
    });
    const patch = await runtime.appendEntry(session.id, {
      type: "PATCH_PROPOSED",
      payload: {
        actionId: "privacy-patch",
        summary: "Update configuration",
        files: [{
          path: "src/config.ts",
          oldContent: `export const oldCredential = '${fixtures.slack}';`,
          newContent: `export const credential = '${fixtures.github}';`,
        }],
      },
      safeMetadata: { actionId: "privacy-patch", recoverable: true },
    });

    expect(patch.safeMetadata.recoverable).toBe(false);
    expect(patch.safeMetadata.sensitiveContentRedacted).toBe(true);
    expect(JSON.stringify(patch.payload)).not.toContain("oldContent");
    expect(JSON.stringify(patch.payload)).not.toContain("newContent");

    const persisted = JSON.stringify({
      session: await store.getSession(session.id),
      entries: await store.listEntries(session.id),
      binding: await store.getProjectBinding("binding-privacy"),
    });
    const exported = JSON.stringify(await runtime.exportRedactedSession(session.id));
    for (const value of [privatePath, ...Object.values(fixtures), "fixture-value-123456"]) {
      expect(persisted).not.toContain(value);
      expect(exported).not.toContain(value);
    }
    expect(exported).not.toContain("/Users/example/Private/project");
    expect(exported).not.toContain("headers");
    expect(exported).not.toContain("structured-fixture-value");
  });
});
