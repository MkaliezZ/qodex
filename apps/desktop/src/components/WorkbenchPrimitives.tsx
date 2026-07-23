import type { LucideIcon } from "lucide-react";

export function StatusIndicator({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  return (
    <span className={`status-indicator status-indicator-${tone}`}>
      <span className="status-indicator-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function ViewTitle({
  title,
  description,
  icon: Icon,
  aside,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  aside?: React.ReactNode;
}) {
  return (
    <header className="workbench-view-header">
      <div className="workbench-view-title">
        {Icon ? <Icon size={18} strokeWidth={1.8} aria-hidden="true" /> : null}
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {aside ? <div className="workbench-view-aside">{aside}</div> : null}
    </header>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="workbench-empty">
      <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}
