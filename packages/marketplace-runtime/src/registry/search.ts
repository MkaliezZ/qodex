import type { RegistryEntry } from "./events.js";

export class SearchIndex {
  constructor(private getEntries: () => RegistryEntry[]) {}

  search(query: string, options?: { packageType?: string; trustLevel?: string; includeDeprecated?: boolean }): RegistryEntry[] {
    if (!query.trim()) return this.getEntries();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    let results = this.getEntries().filter((e) => {
      const searchText = `${e.id} ${e.name} ${e.description} ${e.tags?.join(" ") ?? ""}`.toLowerCase();
      return terms.every((t) => searchText.includes(t));
    });

    // Remove blocked
    results = results.filter((e) => e.trust?.level !== "blocked");

    return results;
  }
}
