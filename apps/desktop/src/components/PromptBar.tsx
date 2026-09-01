import { useState } from "react";
import { Play } from "lucide-react";
import { ModelSwitcher } from "./ModelSwitcher";
import { SkillDrawer } from "./SkillDrawer";
import { useRuntimeContext } from "./AppShell";

export function PromptBar() {
  const [input, setInput] = useState("");
  const {
    agentTask,
    controlPlaneAvailable,
    controlPlaneMode,
    isRunning,
    sendPrompt,
    setControlPlaneMode,
  } = useRuntimeContext();
  const taskActive = isRunning || Boolean(agentTask && !["Done", "Failed", "Cancelled", "LimitReached"].includes(agentTask.status));

  const handleRun = async () => {
    if (!input.trim() || taskActive) return;
    const prompt = input;
    setInput("");
    await sendPrompt(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleRun();
    }
  };

  return (
    <div className="prompt-composer">
      <div className="prompt-input-row">
        <div className="prompt-input-shell">
          <input
            className="qodex-input"
            placeholder="Ask KerniQ to modify your project..."
            data-testid="prompt-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={taskActive}
          />
          <div className="prompt-skill-slot">
            <SkillDrawer />
          </div>
        </div>
        <button
          data-testid="send-button"
          onClick={handleRun}
          disabled={taskActive}
          className="qodex-button prompt-run"
        >
          {taskActive ? (
            <span className="spinner" aria-hidden="true" />
          ) : <Play size={14} fill="currentColor" aria-hidden="true" />}
          Run
        </button>
      </div>

      <div className="prompt-meta-row">
        <div className="prompt-meta-primary">
          {controlPlaneMode === "single" ? <ModelSwitcher /> : null}
          <div className="agent-mode-switch" role="group" aria-label="Agent execution mode">
            <button
              type="button"
              className={controlPlaneMode === "single" ? "is-active" : ""}
              disabled={taskActive}
              onClick={() => setControlPlaneMode("single")}
            >
              Single Agent
            </button>
            <button
              type="button"
              className={controlPlaneMode === "supervisor" ? "is-active" : ""}
              disabled={taskActive || !controlPlaneAvailable}
              title={controlPlaneAvailable ? "Run Codex and governed DSH" : "Desktop runtime required"}
              onClick={() => setControlPlaneMode("supervisor")}
            >
              Codex + DSH
            </button>
          </div>
          <span className="prompt-mode">
            {controlPlaneMode === "supervisor"
              ? "Supervisor"
              : agentTask
                ? "Agent Mode"
                : "Review Mode"}
          </span>
        </div>
        <span className="prompt-hint">Enter to run</span>
      </div>
    </div>
  );
}
