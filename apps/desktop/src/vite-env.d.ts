/// <reference types="vite/client" />

import type { ProjectCommandRunner } from "@qodex/agent-runtime";
import type { AgentFuseBridgeClient } from "@qodex/agentfuse-adapter";
import type { SessionStore } from "@qodex/session-runtime";

interface ImportMetaEnv {
  readonly VITE_KERNIQ_ENABLE_AGENTFUSE_PROOF?: string;
  readonly VITE_KERNIQ_PROJECT_COMMAND_REAL_PROOF?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    /** Development-only deterministic bridge installed by Playwright fixtures. */
    __kerniqTestCommandRunner?: ProjectCommandRunner;
    /** Development-only deterministic AgentFuse bridge installed by Playwright fixtures. */
    __kerniqTestAgentFuseBridge?: AgentFuseBridgeClient;
    /** Development-only deterministic persistence adapter installed by Playwright fixtures. */
    __kerniqTestSessionStore?: SessionStore;
  }
}

export {};
