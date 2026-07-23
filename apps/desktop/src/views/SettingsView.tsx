import { ProviderSettings } from "../components/ProviderSettings";
import { RegistrySourceForm } from "../components/RegistrySourceForm";
import { Database, Settings } from "lucide-react";
import { StatusIndicator, ViewTitle } from "../components/WorkbenchPrimitives";

export function SettingsView() {
  return (
    <div className="workbench-view settings-view">
      <ViewTitle
        title="Settings"
        description="Configure local model access and trusted registry sources."
        icon={Settings}
        aside={<StatusIndicator label="Local-first" tone="success" />}
      />

      <div className="settings-layout">
        <div className="settings-main">
          <section className="settings-section" aria-labelledby="settings-provider-title">
            <div className="settings-section-heading">
              <div>
                <h2 id="settings-provider-title">Providers and models</h2>
                <p>Connect the endpoint used by the local agent runtime.</p>
              </div>
            </div>
            <ProviderSettings />
          </section>

          <section className="settings-section" aria-labelledby="settings-registry-title">
            <div className="settings-section-heading">
              <div>
                <h2 id="settings-registry-title">Registry sources</h2>
                <p>Manage trusted HTTPS sources used to discover skills and tools.</p>
              </div>
            </div>
            <RegistrySourceForm />
          </section>
        </div>

        <aside className="settings-aside" aria-label="Project and runtime settings">
          <div className="settings-aside-heading"><Database size={15} aria-hidden="true" /> Project and runtime</div>
          <div className="data-row">
            <span>Appearance</span><strong>Dark graphite</strong>
          </div>
          <div className="data-row">
            <span>Language</span><strong>English</strong>
          </div>
          <div className="data-row">
            <span>Build</span><strong className="mono-value">v0.2.0-beta.2</strong>
          </div>
          <p className="settings-aside-note">System theme and additional languages are not available in this build.</p>
        </aside>
      </div>
    </div>
  );
}
