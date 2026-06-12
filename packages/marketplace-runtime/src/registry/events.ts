export type TrustLevel = "local" | "community" | "verified" | "official" | "blocked";

export interface RegistrySource { id: string; name: string; url: string; enabled: boolean; priority: number; lastSyncAt?: number; }

export interface PublisherProfile { id: string; name: string; type: "individual" | "organization"; url?: string; }

export interface CompatibilityMetadata { qodexVersion: string; skillRuntimeVersion?: string; platform?: string[]; requiredCapabilities?: string[]; }

export interface TrustMetadata { level: TrustLevel; verified?: boolean; warnings?: string[]; signatureUrl?: string; }

export interface RegistryVersion { version: string; manifestUrl: string; packageUrl: string; checksum: string; changelog?: string; compatibility: CompatibilityMetadata; publishedAt: string; deprecated?: boolean; }

export interface RegistryEntry { id: string; name: string; description: string; packageType: "skill"; latestVersion: string; versions: RegistryVersion[]; publisher: PublisherProfile; trust: TrustMetadata; compatibility: CompatibilityMetadata; tags: string[]; locales?: Record<string, { name: string; description: string }>; createdAt: string; updatedAt: string; }

export interface UpdateCandidate { id: string; installedVersion: string; availableVersion: string; trust: TrustLevel; deprecated?: boolean; }

export interface SyncState { sourceId: string; lastSyncAt: number; entryCount: number; error?: string; }

export interface SyncResult { sourceId: string; newEntries: number; updatedEntries: number; removedEntries: number; errors: string[]; timestamp: number; }

export type RegistryEventType = "registry.sync.started" | "registry.sync.completed" | "registry.sync.failed" | "registry.update.available" | "registry.trust.warning";
export interface RegistryEvent { type: RegistryEventType; payload: unknown; timestamp: number; }
