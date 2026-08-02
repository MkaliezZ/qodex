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
import type { CodingPackPurpose } from "@qodex/coding-pack-runtime";
import type {
  CodingPackDestinationBinding,
  CodingPackOperationSnapshot,
  CodingPackStoreErrorCode,
} from "@qodex/coding-pack-store";
import type { ProposalOrigin } from "../hooks/proposalOwnership";
import { ProjectCommandRealTauriProof } from "./ProjectCommandRealTauriProof";
import type {
  CodingPackPreview,
  CodingPackPreviewConfirmation,
  CodingPackPreviewErrorCode,
} from "../codingPack/preview";
import type {
  CodingPackNativeExportAvailability,
  CodingPackNativeExportErrorCode,
  CodingPackNativeExportResult,
} from "../platform/codingPackNativeExport";

const PROJECT_COMMAND_REAL_PROOF_ENABLED =
  import.meta.env.VITE_KERNIQ_ENABLE_AGENTFUSE_PROOF === "1"
  && import.meta.env.VITE_KERNIQ_PROJECT_COMMAND_REAL_PROOF === "1";

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
  codingPackPurpose: CodingPackPurpose;
  setCodingPackPurpose: (purpose: CodingPackPurpose) => void;
  codingPackPreview: CodingPackPreview | null;
  codingPackConfirmation: CodingPackPreviewConfirmation | null;
  codingPackPreviewError: CodingPackPreviewErrorCode | null;
  codingPackPreviewStale: boolean;
  isCodingPackPreviewLoading: boolean;
  refreshCodingPackPreview: () => Promise<void>;
  confirmCurrentCodingPackPreview: () => Promise<void>;
  codingPackDestination: CodingPackDestinationBinding | null;
  codingPackOperation: CodingPackOperationSnapshot | null;
  codingPackRecoveredOperation: CodingPackOperationSnapshot | null;
  codingPackStoreError: CodingPackStoreErrorCode | null;
  isCodingPackExportLoading: boolean;
  chooseCurrentCodingPackDestination: () => Promise<void>;
  createCurrentCodingPackExportProposal: () => Promise<void>;
  confirmCurrentCodingPackExportProposal: () => Promise<void>;
  evaluateCurrentCodingPackExportPolicy: () => Promise<void>;
  codingPackNativeExportAvailable: boolean;
  codingPackNativeExportAvailability: CodingPackNativeExportAvailability;
  codingPackNativeExportResult: CodingPackNativeExportResult | null;
  codingPackNativeExportError: CodingPackNativeExportErrorCode | null;
  exportCurrentCodingPack: () => Promise<void>;
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

  if (PROJECT_COMMAND_REAL_PROOF_ENABLED) {
    return (
      <RuntimeContext.Provider value={enhancedRuntime}>
        <ProjectCommandRealTauriProof />
      </RuntimeContext.Provider>
    );
  }

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
