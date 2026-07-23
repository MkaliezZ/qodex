import { Boxes } from "lucide-react";
import { StatusIndicator, ViewTitle } from "../components/WorkbenchPrimitives";

export function SkillsView() {
  const skills = [
    { name: "General", description: "Core project inspection guidance.", enabled: true, version: "Built-in" },
    { name: "TypeScript", description: "TypeScript-aware implementation guidance.", enabled: true, version: "Built-in" },
    { name: "React", description: "React patterns and component guidance.", enabled: false, version: "Built-in" },
  ];

  const enabledCount = skills.filter((s) => s.enabled).length;
  const totalCount = skills.length;

  return (
    <div className="workbench-view skills-view">
      <ViewTitle
        title="Skills"
        description="Installed guidance available to the local workbench."
        icon={Boxes}
        aside={<span className="view-count">{enabledCount} of {totalCount} enabled</span>}
      />
      <div className="capability-list" role="list">
        <div className="capability-list-header" aria-hidden="true">
          <span>Capability</span><span>Source</span><span>Status</span>
        </div>
        {skills.map((skill) => (
          <div
            key={skill.name}
            className={`capability-row${skill.enabled ? "" : " is-disabled"}`}
            role="listitem"
          >
            <div className="capability-copy">
              <strong>{skill.name}</strong>
              <span>{skill.description}</span>
            </div>
            <span>{skill.version}</span>
            <StatusIndicator label={skill.enabled ? "Enabled" : "Disabled"} tone={skill.enabled ? "success" : "neutral"} />
          </div>
        ))}
      </div>
    </div>
  );
}
