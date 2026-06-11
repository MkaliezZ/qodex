import { createContext, useContext } from "react";
import { ProjectRail } from "./ProjectRail";
import { AgentTimeline } from "./AgentTimeline";
import { PromptBar } from "./PromptBar";
import { ContextPanel } from "./ContextPanel";
import { useRuntime } from "../hooks/useRuntime";
import type { ProjectTree, FileContent } from "@qodex/project-runtime";
import type { ContextBundle } from "@qodex/context-engine";
import type { PatchProposal } from "@qodex/diff-engine";

interface RuntimeContextValue {
  isRunning: boolean;
  streamedText: string;
  sendPrompt: (prompt: string) => Promise<void>;
  projectName: string | null;
  fileTree: ProjectTree | null;
  openProject: () => Promise<void>;
  toggleFileSelection: (path: string) => Promise<void>;
  selectedFileCount: number;
  selectedFileSize: number;
  contextFiles: FileContent[];
  lastBundle: ContextBundle | null;
  estimatedTokens: number;
  pendingProposal: PatchProposal | null;
  currentProposal: PatchProposal | null;
  applyProposal: () => Promise<void>;
  rejectProposal: () => void;
}

const RuntimeContext = createContext<RuntimeContextValue>({} as RuntimeContextValue);
export function useRuntimeContext() { return useContext(RuntimeContext); }

export function AppShell() {
  const runtime = useRuntime();
  return (
    <RuntimeContext.Provider value={runtime}>
      <div className="qodex-bg" />
      <div className="qodex-layout">
        <div className="qodex-left-rail"><ProjectRail /></div>
        <div className="qodex-center">
          <div className="glass-panel" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <AgentTimeline />
          </div>
          <div className="glass-panel-subtle" style={{ flexShrink: 0 }}>
            <PromptBar />
          </div>
        </div>
        <div className="qodex-right-panel">
          <div className="glass-panel" style={{ flex: 1, overflow: "hidden" }}>
            <ContextPanel />
          </div>
        </div>
      </div>
    </RuntimeContext.Provider>
  );
}
