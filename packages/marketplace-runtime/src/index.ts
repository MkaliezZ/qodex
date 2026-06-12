/**
 * Browser-safe entry point — @qodex/marketplace-runtime
 *
 * Explicitly does NOT export:
 * - SkillInstaller (uses fs)
 * - Adapters (uses fs)
 * - SkillDiscoverer (uses fs)
 * - LocalRegistryCache (uses fs)
 *
 * Use @qodex/marketplace-runtime/node for Node-only exports.
 */

// ── Registry (browser-safe) ──
export { RegistryRuntime } from "./registry/registry.js";
export { SourceManager } from "./registry/source.js";
export { SyncEngine } from "./registry/sync.js";
export { MemoryRegistryCache } from "./registry/cache.js";
export type { RegistryCache, CacheStore } from "./registry/cache.js";
export { SearchIndex } from "./registry/search.js";
export { evaluateTrust, isBlocked, isValidTrustLevel } from "./registry/trust.js";
export { validateEntry } from "./registry/entry.js";
export type {
  RegistrySource, RegistryEntry, RegistryVersion, TrustLevel, TrustMetadata,
  PublisherProfile, CompatibilityMetadata, UpdateCandidate,
  SyncState, SyncResult, RegistryEvent, RegistryEventType,
} from "./registry/events.js";

// ── Versioning (browser-safe) ──
export { parseVersion, compareVersions, isUpdateAvailable, satisfiesCompatibility } from "./versioning/versioning.js";

// ── Manifest (browser-safe) ──
export { validateManifest, parseManifest } from "./manifest/schema.js";
export type { SkillManifestV1, InstallResult, InstallStatus, InstallIndex } from "./models/manifest.js";
export type { SkillAdapter } from "./models/adapter.js";
