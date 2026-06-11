/**
 * Qodex Provider SDK — Provider Registry
 *
 * Central registry for all model providers.
 * Future providers register via registerProvider() and are immediately
 * available through the same lookup API.
 *
 * The registry is provider-agnostic by design:
 * there is no switch/case on provider type anywhere in this file.
 */

import type { ModelProvider } from "../types/provider.js";
import { createError } from "../errors/index.js";
import type { ProviderError } from "../errors/index.js";

export type ProviderRegistration = {
  provider: ModelProvider;
  registeredAt: number;
};

/**
 * ProviderRegistry — singleton-ish container.
 *
 * Instantiate once and inject where needed, or use the default export.
 */
export class ProviderRegistry {
  private providers = new Map<string, ProviderRegistration>();

  /** Register a provider by its id. Overwrites any existing provider with the same id. */
  registerProvider(provider: ModelProvider): void {
    this.providers.set(provider.id, {
      provider,
      registeredAt: Date.now(),
    });
  }

  /** Remove a provider by id. No-op if not found. */
  unregisterProvider(id: string): void {
    this.providers.delete(id);
  }

  /** Look up a registered provider. Throws ProviderError if not found. */
  getProvider(id: string): ModelProvider {
    const registration = this.providers.get(id);
    if (!registration) {
      throw createError("model_not_found", `Provider "${id}" is not registered`);
    }
    return registration.provider;
  }

  /** List all registered provider metadata (id, name, protocol). */
  listProviders(): Array<{ id: string; name: string; protocol: string }> {
    return Array.from(this.providers.values()).map((r) => ({
      id: r.provider.id,
      name: r.provider.name,
      protocol: r.provider.protocol,
    }));
  }

  /** Check if a provider is registered */
  hasProvider(id: string): boolean {
    return this.providers.has(id);
  }

  /** Number of registered providers */
  get size(): number {
    return this.providers.size;
  }

  /** Clear all providers */
  clear(): void {
    this.providers.clear();
  }
}

/** Default singleton instance */
export const defaultRegistry = new ProviderRegistry();
