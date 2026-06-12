export type I18nEventType = "locale:changed" | "bundle:loaded";
export interface LocaleChangedEvent { type: "locale:changed"; locale: string; timestamp: number; }
export interface BundleLoadedEvent { type: "bundle:loaded"; locale: string; namespace: string; keyCount: number; timestamp: number; }
export type I18nEvent = LocaleChangedEvent | BundleLoadedEvent;
export type EventHandler = (event: I18nEvent) => void;
