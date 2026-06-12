export interface Locale { code: string; language: string; region?: string; label: string; direction: "ltr" | "rtl"; }
export type TranslationKey = string;
export interface LocalePreference { user?: string; project?: string; system?: string; }
