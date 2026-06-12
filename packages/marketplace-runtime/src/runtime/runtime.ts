import { AdapterRegistry, QodexNativeAdapter, OpenClawAdapter, ClaudeCodeAdapter } from "../adapters/adapters.js";
import { SkillDiscoverer } from "../discovery/discoverer.js";
import { SkillInstaller } from "../installer/installer.js";
import { validateManifest, parseManifest } from "../manifest/schema.js";
import { isUpdateAvailable, compareVersions } from "../versioning/versioning.js";
import type { SkillAdapter } from "../models/adapter.js";
import type { SkillManifestV1, InstallResult } from "../models/manifest.js";

export class MarketplaceRuntime {
  adapterRegistry = new AdapterRegistry();
  private discoverer: SkillDiscoverer;
  private installer: SkillInstaller;

  constructor(options?: { storagePath?: string }) {
    this.adapterRegistry.register(new QodexNativeAdapter());
    this.adapterRegistry.register(new OpenClawAdapter());
    this.adapterRegistry.register(new ClaudeCodeAdapter());
    this.discoverer = new SkillDiscoverer(this.adapterRegistry);
    this.installer = new SkillInstaller(options?.storagePath ?? `${process.env.HOME || "/tmp"}/.qodex/skills`, this.adapterRegistry);
    this.installer.loadIndex();
  }

  registerAdapter(adapter: SkillAdapter): void { this.adapterRegistry.register(adapter); }
  async discover(dir: string): Promise<SkillManifestV1[]> { return this.discoverer.discover(dir); }
  async detectFormat(dir: string): Promise<string | null> { return this.adapterRegistry.detectFormat(dir); }
  async install(dir: string): Promise<InstallResult> { return this.installer.install(dir); }
  uninstall(id: string): InstallResult { return this.installer.uninstall(id); }
  async update(id: string, dir: string): Promise<InstallResult> { return this.installer.update(id, dir); }
  listInstalled(): SkillManifestV1[] { return this.installer.listInstalled(); }
  getInstalled(id: string): SkillManifestV1 | null { return this.installer.getInstalled(id); }
  checkUpdates(): Array<{ id: string; installed: string; available: string }> { return []; }

  parseManifest(json: string) { return parseManifest(json); }
  validateManifest(data: unknown) { return validateManifest(data); }
  isUpdateAvailable(installed: string, available: string) { return isUpdateAvailable(installed, available); }
  compareVersions(a: string, b: string) { return compareVersions(a, b); }
}
