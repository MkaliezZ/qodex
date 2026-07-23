import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ProjectRail } from "./ProjectRail";
import { AgentTimeline } from "./AgentTimeline";
import { PromptBar } from "./PromptBar";
import { ContextPanel } from "./ContextPanel";
import { CompactInspectorDrawer } from "./CompactInspectorDrawer";
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

function CenterContent({
  activeView,
  inspectorTriggerRef,
  onOpenInspector,
}: {
  activeView: ActiveView;
  inspectorTriggerRef: React.RefObject<HTMLButtonElement>;
  onOpenInspector: () => void;
}) {
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
        <div className="agent-view">
          <div className="workspace-panel">
            <AgentTimeline
              inspectorTriggerRef={inspectorTriggerRef}
              onOpenInspector={onOpenInspector}
            />
          </div>
          <div className="prompt-panel">
            <PromptBar />
          </div>
        </div>
      );
  }
}

/** Inner shell — useRuntime() must run inside ProviderContextProvider */
function AppShellInner() {
  const runtime = useRuntime();
  const [activeView, setActiveView] = useState<ActiveView>("agent");
  const [compactInspectorOpen, setCompactInspectorOpen] = useState(false);
  const inspectorTriggerRef = useRef<HTMLButtonElement>(null);

  const enhancedRuntime = { ...runtime, activeView, setActiveView };

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1181px)");
    const closeAtWideWidth = (event: MediaQueryListEvent) => {
      if (event.matches) setCompactInspectorOpen(false);
    };
    media.addEventListener("change", closeAtWideWidth);
    return () => media.removeEventListener("change", closeAtWideWidth);
  }, []);

  return (
    <RuntimeContext.Provider value={enhancedRuntime}>
      <div className="qodex-layout" data-testid="app-shell">
        <div className="qodex-left-rail"><ProjectRail /></div>
        <div className="qodex-center">
          <CenterContent
            activeView={activeView}
            inspectorTriggerRef={inspectorTriggerRef}
            onOpenInspector={() => setCompactInspectorOpen(true)}
          />
        </div>
        <div className="qodex-right-panel">
          <div className="context-panel-shell">
            <ContextPanel />
          </div>
        </div>
        <CompactInspectorDrawer
          open={compactInspectorOpen}
          onClose={() => setCompactInspectorOpen(false)}
          triggerRef={inspectorTriggerRef}
        />
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
