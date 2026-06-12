import type { TranslationKey } from "./locale.js";
export interface TranslationBundle { locale: string; namespace: string; entries: Record<TranslationKey, string>; }
export interface TranslationResult { value: string; sourceLocale: string; fallbackUsed: boolean; }
