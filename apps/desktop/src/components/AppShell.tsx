import { createContext, useContext, useState } from "react";
import { ProjectRail } from "./ProjectRail";
import { AgentTimeline } from "./AgentTimeline";
import { PromptBar } from "./PromptBar";
import { ContextPanel } from "./ContextPanel";
import { useRuntime } from "../hooks/useRuntime";
import { ProviderContextProvider } from "./ProviderContext";
import { RegistryContextProvider } from "./RegistryContext";
import { SessionContextProvider } from "./SessionContext";
import { FilesView } from "../views/FilesView";
import { SessionsView } from "../views/SessionsView";
import { SkillsView } from "../views/SkillsView";
import { GitView } from "../views/GitView";
import { SettingsView } from "../views/SettingsView";
import { MarketplaceView } from "../views/MarketplaceView";
import type { ProjectTree, FileContent } from "@qodex/project-runtime";
import type { ContextBundle } from "@qodex/context-engine";
import type { ApplyResult, PatchError, PatchProposal } from "@qodex/diff-engine";
import type { ProjectAccessSource } from "../platform/types";
import type { AgentLoopTask } from "@qodex/agent-runtime";
import type { ProposalOrigin } from "../hooks/proposalOwnership";

export type ActiveView = "agent" | "files" | "sessions" | "skills" | "git" | "settings" | "marketplace";

interface RuntimeContextValue {
  isRunning: boolean;
  agentTask: AgentLoopTask | null;
  agentModeNotice: string | null;
  streamedText: string;
  sendPrompt: (prompt: string) => Promise<void>;
  stopTask: () => Promise<void>;
  projectName: string | null;
  projectSource: ProjectAccessSource | null;
  fileTree: ProjectTree | null;
  openProject: () => Promise<void>;
  toggleFileSelection: (path: string) => Promise<void>;
  selectedFileCount: number;
  selectedFileSize: number;
  contextFiles: FileContent[];
  lastBundle: ContextBundle | null;
  estimatedTokens: number;
  pendingProposal: PatchProposal | null;
  proposalOrigin: ProposalOrigin | null;
  proposalNotice: string | null;
  proposalActionsAvailable: boolean;
  currentProposal: PatchProposal | null;
  patchErrors: PatchError[];
  applyResults: ApplyResult[];
  rollbackResults: ApplyResult[];
  isApplying: boolean;
  isRollingBack: boolean;
  agentRollbackAvailable: boolean;
  agentRollbackReason: string | null;
  applyProposal: () => Promise<void>;
  rejectProposal: () => Promise<void>;
  rollbackProposal: () => Promise<void>;
  rollbackAllPatches: () => Promise<void>;
  approveCommand: () => Promise<void>;
  denyCommand: () => Promise<void>;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
}

const RuntimeContext = createContext<RuntimeContextValue>({} as RuntimeContextValue);
export function useRuntimeContext() { return useContext(RuntimeContext); }

function CenterContent({ activeView }: { activeView: ActiveView }) {
  switch (activeView) {
    case "files": return <FilesView />;
    case "sessions": return <SessionsView />;
    case "skills": return <SkillsView />;
    case "git": return <GitView />;
    case "settings": return <SettingsView />;
    case "marketplace": return <MarketplaceView />;
    case "agent":
    default:
      return (
        <>
          <div className="glass-panel workspace-panel" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <AgentTimeline />
          </div>
          <div className="glass-panel-subtle prompt-panel" style={{ flexShrink: 0 }}>
            <PromptBar />
          </div>
        </>
      );
  }
}

/** Inner shell — useRuntime() must run inside ProviderContextProvider */
function AppShellInner() {
  const runtime = useRuntime();
  const [activeView, setActiveView] = useState<ActiveView>("agent");

  const enhancedRuntime = { ...runtime, activeView, setActiveView };

  return (
    <RuntimeContext.Provider value={enhancedRuntime}>
      <div className="qodex-bg" />
      <div className="qodex-layout" data-testid="app-shell">
        <div className="qodex-left-rail"><ProjectRail /></div>
        <div className="qodex-center"><CenterContent activeView={activeView} /></div>
        <div className="qodex-right-panel">
          <div className="glass-panel context-panel-shell" style={{ flex: 1, overflow: "hidden" }}>
            <ContextPanel />
          </div>
        </div>
      </div>
    </RuntimeContext.Provider>
  );
}

/** Outer shell — ProviderContextProvider wraps everything so useRuntime sees provider state */
export function AppShell() {
  return (
    <ProviderContextProvider>
      <RegistryContextProvider>
        <SessionContextProvider>
          <AppShellInner />
        </SessionContextProvider>
      </RegistryContextProvider>
    </ProviderContextProvider>
  );
}
