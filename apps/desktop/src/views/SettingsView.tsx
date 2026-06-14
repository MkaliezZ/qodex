import { ProviderSettings } from "../components/ProviderSettings";
import { RegistrySourceForm } from "../components/RegistrySourceForm";

export function SettingsView() {
  return (
    <div className="view-page settings-view">
      <header className="view-header">
        <div>
          <div className="view-eyebrow">Workbench configuration</div>
          <h1>Settings</h1>
          <p>Manage the local providers and registries that power your agent workspace.</p>
        </div>
        <div className="local-first-chip"><span className="status-dot status-dot-active" /> Local-first</div>
      </header>

      <div className="settings-grid">
        <section className="surface-card settings-card settings-card-provider">
          <div className="card-heading">
            <div className="card-heading-icon">P</div>
            <div>
              <h2>Provider</h2>
              <p>Connect the model endpoint used by your local agent runtime.</p>
            </div>
          </div>
          <ProviderSettings />
        </section>

        <section className="surface-card settings-card">
          <div className="card-heading">
            <div className="card-heading-icon card-heading-icon-violet">R</div>
            <div>
              <h2>Registry Sources</h2>
              <p>Control the trusted sources used to discover skills and tools.</p>
            </div>
          </div>
          <RegistrySourceForm />
        </section>

        <section className="surface-card settings-card settings-card-compact">
          <div className="setting-summary">
            <div><span className="setting-summary-label">Appearance</span><strong>Dark glass</strong></div>
            <span className="setting-summary-note">System theme support planned</span>
          </div>
          <div className="setting-summary">
            <div><span className="setting-summary-label">Language</span><strong>English</strong></div>
            <span className="setting-summary-note">Internationalization in progress</span>
          </div>
          <div className="setting-summary">
            <div><span className="setting-summary-label">Build</span><strong className="version-chip">v0.2.0-beta.2</strong></div>
            <span className="setting-summary-note">Beta release</span>
          </div>
        </section>
      </div>
    </div>
  );
}
