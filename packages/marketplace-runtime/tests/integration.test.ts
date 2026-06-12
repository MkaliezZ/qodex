import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { MarketplaceRuntime } from "../src/runtime/runtime.js";

const TEST_DIR = "/tmp/qodex-mp-test";

function createNativeSkill(id: string, version = "1.0.0") {
  const dir = `${TEST_DIR}/${id}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/skill.json`, JSON.stringify({ id, name: id, description: id, version, author: "test", license: "MIT", tags: [], compatibility: { qodex: ">=0.1.0", source: "native" } }));
  writeFileSync(`${dir}/SKILL.md`, "# Test Skill");
  return dir;
}

function createOpenClawSkill(id: string) {
  const dir = `${TEST_DIR}/openclaw-${id}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/SKILL.md`, `# ${id}\n\nOpenClaw format skill`);
  return dir;
}

function createClaudeCodeSkill(id: string) {
  const dir = `${TEST_DIR}/claude-${id}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/CLAUDE.md`, `# ${id}\n\nClaude Code format`);
  return dir;
}

describe("MarketplaceRuntime", () => {
  let rt: MarketplaceRuntime;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    rt = new MarketplaceRuntime({ storagePath: `${TEST_DIR}/skills-store` });
  });

  describe("detectFormat", () => {
    it("detects native qodex format", async () => {
      const d = createNativeSkill("test");
      expect(await rt.detectFormat(d)).toBe("qodex-native");
    });
    it("detects openclaw format", async () => {
      const d = createOpenClawSkill("oc");
      expect(await rt.detectFormat(d)).toBe("openclaw");
    });
    it("detects claude-code format", async () => {
      const d = createClaudeCodeSkill("cc");
      expect(await rt.detectFormat(d)).toBe("claude-code");
    });
  });

  describe("install / uninstall", () => {
    it("installs a native skill", async () => {
      const r = await rt.install(createNativeSkill("devtools"));
      expect(r.status).toBe("installed");
      expect(r.id).toBe("devtools");
    });

    it("rejects duplicate installation", async () => {
      await rt.install(createNativeSkill("dup"));
      const r2 = await rt.install(createNativeSkill("dup"));
      expect(r2.status).toBe("failed");
    });

    it("installs an openclaw skill", async () => {
      const r = await rt.install(createOpenClawSkill("lint"));
      expect(r.status).toBe("installed");
    });

    it("listInstalled returns installed skills", async () => {
      await rt.install(createNativeSkill("a"));
      await rt.install(createNativeSkill("b"));
      expect(rt.listInstalled().length).toBe(2);
    });

    it("getInstalled returns specific skill", async () => {
      await rt.install(createNativeSkill("my-skill"));
      expect(rt.getInstalled("my-skill")?.version).toBe("1.0.0");
    });

    it("uninstalls a skill", async () => {
      await rt.install(createNativeSkill("temp"));
      const r = rt.uninstall("temp");
      expect(r.status).toBe("removed");
      expect(rt.getInstalled("temp")).toBeNull();
    });
  });

  describe("update", () => {
    it("updates to newer version", async () => {
      await rt.install(createNativeSkill("upd"));
      const r = await rt.update("upd", createNativeSkill("upd", "2.0.0"));
      expect(r.status).toBe("updated");
      expect(rt.getInstalled("upd")?.version).toBe("2.0.0");
    });

    it("rejects update with same or older version", async () => {
      await rt.install(createNativeSkill("same"));
      const r = await rt.update("same", createNativeSkill("same", "1.0.0"));
      expect(r.status).toBe("failed");
    });
  });

  describe("discover", () => {
    it("discovers skills in a multi-skill directory", async () => {
      createNativeSkill("skill-a");
      createNativeSkill("skill-b");
      const skills = await rt.discover(TEST_DIR);
      expect(skills.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("security", () => {
    it("rejects invalid manifest during install", async () => {
      const dir = `${TEST_DIR}/sec-skill`;
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}/skill.json`, JSON.stringify({ id: "bad id", name: "e", description: "e", version: "1.0.0", author: "x", license: "MIT", tags: [], compatibility: { qodex: ">=0.1.0", source: "native" } }));
      writeFileSync(`${dir}/SKILL.md`, "# Test");
      const r = await rt.install(dir);
      expect(r.status).toBe("failed");
    });
  });
});
