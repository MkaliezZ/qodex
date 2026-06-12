import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync, cpSync } from "fs";
import { AdapterRegistry } from "../adapters/adapters.js";
import type { SkillManifestV1, InstallResult, InstallIndex } from "../models/manifest.js";
import { isUpdateAvailable } from "../versioning/versioning.js";

export class SkillInstaller {
  private index: InstallIndex = { skills: {} };
  private indexLoaded = false;

  constructor(
    private storagePath: string,
    private adapterRegistry: AdapterRegistry,
  ) {}

  private indexPath(): string { return `${this.storagePath}/index.json`; }
  private skillPath(id: string): string { return `${this.storagePath}/${id}`; }

  loadIndex(): void {
    mkdirSync(this.storagePath, { recursive: true });
    if (existsSync(this.indexPath())) {
      try { this.index = JSON.parse(readFileSync(this.indexPath(), "utf-8")); }
      catch { this.index = { skills: {} }; }
    }
    this.indexLoaded = true;
  }

  private saveIndex(): void {
    mkdirSync(this.storagePath, { recursive: true });
    writeFileSync(this.indexPath(), JSON.stringify(this.index, null, 2));
  }

  async install(dirPath: string): Promise<InstallResult> {
    if (!this.indexLoaded) this.loadIndex();
    const adapter = await this.adapterRegistry.getAdapter(dirPath);
    if (!adapter) return { id: "", version: "", status: "failed", path: dirPath };

    let manifest: SkillManifestV1;
    try { const r = await adapter.import(dirPath); manifest = r.manifest; }
    catch { return { id: "", version: "", status: "failed", path: dirPath }; }
    // Reject path traversal
    if (manifest.id.includes("..") || manifest.id.includes("/")) return { id: manifest.id, version: manifest.version, status: "failed", path: dirPath };
    // Reject duplicates
    if (this.index.skills[manifest.id]) return { id: manifest.id, version: manifest.version, status: "failed", path: dirPath };

    const dest = this.skillPath(manifest.id);
    mkdirSync(dest, { recursive: true });
    try { cpSync(dirPath, dest, { recursive: true }); } catch { return { id: manifest.id, version: manifest.version, status: "failed", path: dirPath }; }

    this.index.skills[manifest.id] = { manifest, installedAt: new Date().toISOString() };
    this.saveIndex();
    return { id: manifest.id, version: manifest.version, status: "installed", path: dest };
  }

  uninstall(skillId: string): InstallResult {
    if (!this.indexLoaded) this.loadIndex();
    if (!this.index.skills[skillId]) return { id: skillId, version: "", status: "failed", path: "" };
    const dest = this.skillPath(skillId);
    try { rmSync(dest, { recursive: true, force: true }); } catch { /* skip */ }
    delete this.index.skills[skillId];
    this.saveIndex();
    return { id: skillId, version: "", status: "removed", path: dest };
  }

  async update(skillId: string, dirPath: string): Promise<InstallResult> {
    if (!this.indexLoaded) this.loadIndex();
    const existing = this.index.skills[skillId];
    if (!existing) return { id: skillId, version: "", status: "failed", path: dirPath };

    const adapter = await this.adapterRegistry.getAdapter(dirPath);
    if (!adapter) return { id: skillId, version: "", status: "failed", path: dirPath };
    let manifest: SkillManifestV1;
    try { const r = await adapter.import(dirPath); manifest = r.manifest; }
    catch { return { id: skillId, version: "", status: "failed", path: dirPath }; }
    if (!isUpdateAvailable(existing.manifest.version, manifest.version)) return { id: skillId, version: manifest.version, status: "failed", path: dirPath };

    // Backup
    const dest = this.skillPath(skillId);
    const backup = `${this.storagePath}/.backup/${skillId}`;
    try { mkdirSync(`${this.storagePath}/.backup`, { recursive: true }); cpSync(dest, backup, { recursive: true }); } catch { /* non-fatal */ }

    // Replace
    try { rmSync(dest, { recursive: true, force: true }); cpSync(dirPath, dest, { recursive: true }); }
    catch { return { id: skillId, version: manifest.version, status: "failed", path: dirPath }; }

    this.index.skills[skillId] = { manifest, installedAt: new Date().toISOString() };
    this.saveIndex();
    return { id: skillId, version: manifest.version, status: "updated", path: dest };
  }

  listInstalled(): SkillManifestV1[] { if (!this.indexLoaded) this.loadIndex(); return Object.values(this.index.skills).map((s) => s.manifest); }
  getInstalled(id: string): SkillManifestV1 | null { if (!this.indexLoaded) this.loadIndex(); return this.index.skills[id]?.manifest ?? null; }
}
