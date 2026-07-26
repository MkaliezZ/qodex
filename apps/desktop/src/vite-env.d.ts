/// <reference types="vite/client" />

import type { ProjectCommandRunner } from "@qodex/agent-runtime";
import type { SessionStore } from "@qodex/session-runtime";

interface ImportMetaEnv {
  readonly VITE_KERNIQ_ENABLE_AGENTFUSE_PROOF?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    /** Development-only deterministic bridge installed by Playwright fixtures. */
    __kerniqTestCommandRunner?: ProjectCommandRunner;
    /** Development-only deterministic persistence adapter installed by Playwright fixtures. */
    __kerniqTestSessionStore?: SessionStore;
  }
}

export {};
