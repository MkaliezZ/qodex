/// <reference types="vite/client" />

import type { ProjectCommandRunner } from "@qodex/agent-runtime";

declare global {
  interface Window {
    /** Development-only deterministic bridge installed by Playwright fixtures. */
    __kerniqTestCommandRunner?: ProjectCommandRunner;
  }
}

export {};
