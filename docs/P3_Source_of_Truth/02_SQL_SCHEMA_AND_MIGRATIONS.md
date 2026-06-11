# Qodex SQL Schema and Migrations

## Database

- SQLite
- Drizzle ORM
- WAL mode recommended
- Foreign keys enabled

Runtime initialization:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```

---

# Migration 0001 Initial Schema

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  git_root TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT
);

CREATE INDEX idx_projects_last_opened ON projects(last_opened_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_project_id ON sessions(project_id);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  model_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_session_id ON messages(session_id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'idle',
    'planning',
    'selecting_context',
    'calling_model',
    'executing_tools',
    'generating_patch',
    'reviewing_diff',
    'applying_patch',
    'done',
    'failed',
    'cancelled'
  )),
  active_model_id TEXT,
  selected_skills_json TEXT NOT NULL DEFAULT '[]',
  context_files_json TEXT NOT NULL DEFAULT '[]',
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_session_id ON tasks(session_id);
CREATE INDEX idx_tasks_status ON tasks(status);

CREATE TABLE provider_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  protocol TEXT NOT NULL,
  base_url TEXT,
  api_key_ref TEXT,
  default_model TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_provider_configs_type ON provider_configs(type);

CREATE TABLE model_configs (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  context_window INTEGER,
  supports_tools INTEGER NOT NULL DEFAULT 0,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  supports_reasoning INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(provider_id) REFERENCES provider_configs(id) ON DELETE CASCADE
);

CREATE INDEX idx_model_configs_provider_id ON model_configs(provider_id);

CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('global', 'project')),
  project_id TEXT,
  description TEXT,
  version TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  permissions_json TEXT NOT NULL DEFAULT '{}',
  manifest_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_skills_name ON skills(name);
CREATE INDEX idx_skills_project_id ON skills(project_id);

CREATE TABLE skill_runs (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started', 'completed', 'failed', 'cancelled')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  error_message TEXT,
  FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT,
  risk_level TEXT NOT NULL CHECK(risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL CHECK(status IN ('pending_approval', 'running', 'completed', 'failed', 'denied')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_tool_calls_task_id ON tool_calls(task_id);

CREATE TABLE patches (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  patch_text TEXT NOT NULL,
  changed_files_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('proposed', 'applied', 'rejected', 'failed')),
  created_at TEXT NOT NULL,
  applied_at TEXT,
  error_message TEXT,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_patches_task_id ON patches(task_id);
CREATE INDEX idx_patches_project_id ON patches(project_id);

CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL CHECK(transport IN ('stdio', 'http', 'sse')),
  command TEXT,
  args_json TEXT NOT NULL DEFAULT '[]',
  url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  permissions_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  task_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_logs_project_id ON audit_logs(project_id);
CREATE INDEX idx_audit_logs_task_id ON audit_logs(task_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

# Migration 0002 Project Index

```sql
CREATE TABLE project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('file', 'directory')),
  size_bytes INTEGER,
  hash TEXT,
  language TEXT,
  indexed_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, path)
);

CREATE INDEX idx_project_files_project_path ON project_files(project_id, path);
CREATE INDEX idx_project_files_language ON project_files(language);
```

---

# Migration 0003 Context Snapshots

```sql
CREATE TABLE context_snapshots (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  budget_tokens INTEGER,
  used_tokens INTEGER,
  selected_files_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_context_snapshots_task_id ON context_snapshots(task_id);
```

---

# Drizzle Table Naming

Use singular object names in code and plural table names in SQL.

Example:

```ts
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique()
});
```

---

# Migration Rules

1. Never edit an existing migration after release.
2. Every schema change requires a new migration.
3. Migration files must be numbered.
4. SQLite foreign keys must be enabled at runtime.
5. All JSON columns use `_json` suffix.
