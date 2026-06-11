import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRegistry } from "../src/registry/index.js";
import type { ModelProvider } from "../src/types/provider.js";
import type { ModelChunk } from "../src/types/chunk.js";
import type { ModelRequest } from "../src/types/message.js";
import type { ModelInfo } from "../src/types/provider.js";

/** Minimal mock provider for registry tests */
function createMockProvider(id: string, name: string): ModelProvider {
  return {
    id,
    name,
    protocol: "openai-chat" as const,
    async listModels(): Promise<ModelInfo[]> {
      return [{ id: `${id}-model-1`, displayName: `${name} Model 1` }];
    },
    async *stream(_request: ModelRequest): AsyncIterable<ModelChunk> {
      yield { type: "text", text: "mock" };
    },
    async testConnection(): Promise<boolean> {
      return true;
    },
  };
}

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("starts empty", () => {
    expect(registry.size).toBe(0);
    expect(registry.listProviders()).toEqual([]);
  });

  it("registers a provider", () => {
    const provider = createMockProvider("test-provider", "Test Provider");
    registry.registerProvider(provider);
    expect(registry.size).toBe(1);
    expect(registry.hasProvider("test-provider")).toBe(true);
  });

  it("retrieves a registered provider", () => {
    const provider = createMockProvider("test", "Test");
    registry.registerProvider(provider);
    const retrieved = registry.getProvider("test");
    expect(retrieved.id).toBe("test");
    expect(retrieved.name).toBe("Test");
  });

  it("throws on unregistered provider lookup", () => {
    expect(() => registry.getProvider("nonexistent")).toThrow(
      'Provider "nonexistent" is not registered',
    );
  });

  it("unregisters a provider", () => {
    const provider = createMockProvider("to-remove", "To Remove");
    registry.registerProvider(provider);
    expect(registry.size).toBe(1);
    registry.unregisterProvider("to-remove");
    expect(registry.size).toBe(0);
    expect(registry.hasProvider("to-remove")).toBe(false);
  });

  it("overwrites an existing provider on re-register", () => {
    const p1 = createMockProvider("dup", "First");
    const p2 = createMockProvider("dup", "Second");
    registry.registerProvider(p1);
    registry.registerProvider(p2);
    expect(registry.size).toBe(1);
    expect(registry.getProvider("dup").name).toBe("Second");
  });

  it("lists all registered providers", () => {
    registry.registerProvider(createMockProvider("a", "A"));
    registry.registerProvider(createMockProvider("b", "B"));
    registry.registerProvider(createMockProvider("c", "C"));
    const list = registry.listProviders();
    expect(list).toHaveLength(3);
    expect(list.map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("clears all providers", () => {
    registry.registerProvider(createMockProvider("a", "A"));
    registry.registerProvider(createMockProvider("b", "B"));
    registry.clear();
    expect(registry.size).toBe(0);
  });
});
