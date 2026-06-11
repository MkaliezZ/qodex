# Qodex API Contract

## Purpose

This document defines the local API contract between the Qodex UI and runtime layer.

Although Qodex is desktop-first, the internal runtime should be treated like a local service.

Recommended implementation:

- Tauri commands for native bridge
- Internal TypeScript service layer
- Optional local HTTP API later

---

# OpenAPI 3.1 Draft

```yaml
openapi: 3.1.0
info:
  title: Qodex Local Runtime API
  version: 0.1.0
servers:
  - url: qodex://local
paths:
  /projects:
    get:
      operationId: listProjects
      responses:
        "200":
          description: List projects
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ProjectList"
    post:
      operationId: openProject
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/OpenProjectRequest"
      responses:
        "200":
          description: Opened project
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Project"

  /projects/{projectId}/file-tree:
    get:
      operationId: getProjectFileTree
      parameters:
        - name: projectId
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: File tree
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/FileTree"

  /sessions:
    post:
      operationId: createSession
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateSessionRequest"
      responses:
        "200":
          description: Session
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Session"

  /tasks:
    post:
      operationId: createAgentTask
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateTaskRequest"
      responses:
        "200":
          description: Task
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AgentTask"

  /tasks/{taskId}/stream:
    get:
      operationId: streamTaskEvents
      parameters:
        - name: taskId
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Event stream
          content:
            text/event-stream:
              schema:
                $ref: "#/components/schemas/TaskEvent"

  /providers:
    get:
      operationId: listProviders
      responses:
        "200":
          description: Providers
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ProviderList"
    post:
      operationId: createProvider
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateProviderRequest"
      responses:
        "200":
          description: Provider
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ProviderConfig"

  /providers/{providerId}/test:
    post:
      operationId: testProvider
      parameters:
        - name: providerId
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Test result
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ProviderTestResult"

  /skills:
    get:
      operationId: listSkills
      responses:
        "200":
          description: Skills
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SkillList"

  /patches/{patchId}/apply:
    post:
      operationId: applyPatch
      parameters:
        - name: patchId
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ApplyPatchRequest"
      responses:
        "200":
          description: Apply result
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ApplyPatchResult"

components:
  schemas:
    Project:
      type: object
      required: [id, name, path, createdAt, updatedAt]
      properties:
        id: { type: string }
        name: { type: string }
        path: { type: string }
        gitRoot: { type: [string, "null"] }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }
        lastOpenedAt: { type: [string, "null"], format: date-time }

    ProjectList:
      type: object
      required: [items]
      properties:
        items:
          type: array
          items:
            $ref: "#/components/schemas/Project"

    OpenProjectRequest:
      type: object
      required: [path]
      properties:
        path: { type: string }

    FileNode:
      type: object
      required: [name, path, type]
      properties:
        name: { type: string }
        path: { type: string }
        type:
          type: string
          enum: [file, directory]
        children:
          type: array
          items:
            $ref: "#/components/schemas/FileNode"

    FileTree:
      type: object
      required: [root]
      properties:
        root:
          $ref: "#/components/schemas/FileNode"

    Session:
      type: object
      required: [id, projectId, title, status, createdAt, updatedAt]
      properties:
        id: { type: string }
        projectId: { type: string }
        title: { type: string }
        status:
          type: string
          enum: [active, archived]
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }

    CreateSessionRequest:
      type: object
      required: [projectId, title]
      properties:
        projectId: { type: string }
        title: { type: string }

    CreateTaskRequest:
      type: object
      required: [projectId, sessionId, prompt, modelId]
      properties:
        projectId: { type: string }
        sessionId: { type: string }
        prompt: { type: string }
        modelId: { type: string }
        selectedSkills:
          type: array
          items: { type: string }
        contextFiles:
          type: array
          items: { type: string }

    AgentTask:
      type: object
      required: [id, projectId, sessionId, prompt, status, createdAt]
      properties:
        id: { type: string }
        projectId: { type: string }
        sessionId: { type: string }
        prompt: { type: string }
        status:
          type: string
          enum:
            - idle
            - planning
            - selecting_context
            - calling_model
            - executing_tools
            - generating_patch
            - reviewing_diff
            - applying_patch
            - done
            - failed
            - cancelled
        activeModelId: { type: string }
        createdAt: { type: string, format: date-time }

    TaskEvent:
      type: object
      required: [type, taskId, createdAt]
      properties:
        type:
          type: string
          enum:
            - task.started
            - task.status_changed
            - message.delta
            - tool.started
            - tool.completed
            - patch.created
            - task.completed
            - task.failed
        taskId: { type: string }
        payload: { type: object }
        createdAt: { type: string, format: date-time }

    ProviderConfig:
      type: object
      required: [id, name, type, protocol, enabled]
      properties:
        id: { type: string }
        name: { type: string }
        type:
          type: string
          enum: [openai, deepseek, openrouter, anthropic, gemini, qwen, glm, minimax, mimo, kimi, grok, ollama, custom]
        protocol:
          type: string
          enum: [openai-chat, openai-responses, anthropic, gemini, ollama, custom]
        baseUrl: { type: [string, "null"] }
        defaultModel: { type: [string, "null"] }
        enabled: { type: boolean }

    ProviderList:
      type: object
      required: [items]
      properties:
        items:
          type: array
          items:
            $ref: "#/components/schemas/ProviderConfig"

    CreateProviderRequest:
      type: object
      required: [name, type, protocol]
      properties:
        name: { type: string }
        type: { type: string }
        protocol: { type: string }
        baseUrl: { type: string }
        apiKey: { type: string }
        defaultModel: { type: string }

    ProviderTestResult:
      type: object
      required: [ok]
      properties:
        ok: { type: boolean }
        message: { type: string }

    Skill:
      type: object
      required: [id, name, path, enabled]
      properties:
        id: { type: string }
        name: { type: string }
        path: { type: string }
        description: { type: string }
        enabled: { type: boolean }
        permissions:
          type: object

    SkillList:
      type: object
      required: [items]
      properties:
        items:
          type: array
          items:
            $ref: "#/components/schemas/Skill"

    ApplyPatchRequest:
      type: object
      required: [mode]
      properties:
        mode:
          type: string
          enum: [all, selected_files]
        selectedFiles:
          type: array
          items: { type: string }

    ApplyPatchResult:
      type: object
      required: [ok]
      properties:
        ok: { type: boolean }
        appliedFiles:
          type: array
          items: { type: string }
        error: { type: string }
```

---

# JSON Schemas

## ModelProviderConfig

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://qodex.dev/schemas/provider-config.json",
  "title": "ProviderConfig",
  "type": "object",
  "required": ["id", "name", "type", "protocol", "enabled"],
  "properties": {
    "id": { "type": "string" },
    "name": { "type": "string" },
    "type": {
      "type": "string",
      "enum": ["openai", "deepseek", "openrouter", "anthropic", "gemini", "qwen", "glm", "minimax", "mimo", "kimi", "grok", "ollama", "custom"]
    },
    "protocol": {
      "type": "string",
      "enum": ["openai-chat", "openai-responses", "anthropic", "gemini", "ollama", "custom"]
    },
    "baseUrl": { "type": ["string", "null"] },
    "apiKeyRef": { "type": ["string", "null"] },
    "defaultModel": { "type": ["string", "null"] },
    "enabled": { "type": "boolean" }
  }
}
```

## SkillManifest

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://qodex.dev/schemas/skill-manifest.json",
  "title": "SkillManifest",
  "type": "object",
  "required": ["name", "version", "description", "permissions"],
  "properties": {
    "name": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{1,63}$" },
    "version": { "type": "string" },
    "description": { "type": "string" },
    "entry": { "type": "string", "default": "SKILL.md" },
    "permissions": {
      "type": "object",
      "properties": {
        "file_read": { "type": "boolean" },
        "file_write": { "type": "boolean" },
        "shell": { "type": "boolean" },
        "network": { "type": "boolean" },
        "git": { "type": "boolean" }
      },
      "additionalProperties": false
    },
    "activation": {
      "type": "object",
      "properties": {
        "manual": { "type": "string" },
        "auto_keywords": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  }
}
```
