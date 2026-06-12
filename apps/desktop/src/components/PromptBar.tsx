import { useState, useRef } from "react";
import { ModelSwitcher } from "./ModelSwitcher";
import { SkillDrawer } from "./SkillDrawer";
import { useRuntimeContext } from "./AppShell";

export function PromptBar() {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { isRunning, sendPrompt } = useRuntimeContext();

  const handleRun = async () => {
    if (!input.trim() || isRunning) return;
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

  const handleNotAvailable = (feature: string) => {
    // Simple alert-less feedback — could be enhanced later
    if (inputRef.current) {
      inputRef.current.placeholder = `${feature} coming soon...`;
      setTimeout(() => {
        if (inputRef.current)
          inputRef.current.placeholder = "Ask Qodex to modify your project...";
      }, 2000);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 14px",
      }}
    >
      {/* Input row */}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            ref={inputRef}
            className="qodex-input"
            placeholder="Ask Qodex to modify your project..."
            data-testid="prompt-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            style={{ paddingRight: 64, minHeight: 40, fontSize: 13 }}
          />
          <div
            style={{
              position: "absolute",
              right: 6,
              bottom: 6,
              display: "flex",
              gap: 4,
            }}
          >
            <SkillDrawer />
          </div>
        </div>
        <button
          className="qodex-button"
          data-testid="send-button"
          onClick={handleRun}
          disabled={isRunning}
          style={{
            height: 40,
            minWidth: 64,
            borderRadius: 8,
            fontSize: 13,
            opacity: isRunning ? 0.5 : 1,
            cursor: isRunning ? "not-allowed" : "pointer",
          }}
        >
          {isRunning ? (
            <span className="spinner" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "#5B8CFF", borderRadius: "50%", animation: "spin 600ms linear infinite" }} />
          ) : null}
          Run
        </button>
      </div>

      {/* Action bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ModelSwitcher />
          <span className="text-caption" style={{ fontSize: 10, opacity: 0.4 }}>
            ·
          </span>
          <span className="text-caption" style={{ fontSize: 11 }}>
            Review Mode
          </span>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          <button
            className="qodex-button qodex-button-secondary"
            title="Attach files"
            onClick={() => handleNotAvailable("File attachment")}
            style={{
              width: 26,
              height: 26,
              padding: 0,
              borderRadius: 6,
              fontSize: 12,
              color: "rgba(255,255,255,0.30)",
              border: "1px solid rgba(255,255,255,0.04)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            ⊕
          </button>
          <button
            className="qodex-button qodex-button-secondary"
            title="Context selector"
            onClick={() => handleNotAvailable("Context selector")}
            style={{
              width: 26,
              height: 26,
              padding: 0,
              borderRadius: 6,
              fontSize: 12,
              color: "rgba(255,255,255,0.30)",
              border: "1px solid rgba(255,255,255,0.04)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            ⊞
          </button>
        </div>
      </div>
    </div>
  );
}
