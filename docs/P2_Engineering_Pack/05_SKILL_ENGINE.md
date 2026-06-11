# Qodex Skill Engine

## Goal

Qodex Skills allow users to teach the agent repeatable workflows.

## Directory Structure

```text
.qodex/
└── skills/
    └── code-review/
        ├── SKILL.md
        ├── skill.json
        ├── resources/
        └── scripts/
```

## skill.json

```json
{
  "name": "code-review",
  "description": "Review code for quality, safety, and consistency.",
  "version": "0.1.0",
  "permissions": {
    "file_read": true,
    "file_write": false,
    "shell": false,
    "network": false
  },
  "activation": {
    "manual": "$code-review",
    "auto_keywords": ["review", "audit", "检查代码"]
  }
}
```

## SKILL.md

`SKILL.md` contains instructions injected into model context when the skill is activated.

## Activation

Manual:

```text
$code-review review current diff
```

Auto:

User prompt matches skill keywords.

Project default:

```toml
[skills]
enabled = ["code-review", "freight-forwarding"]
```

## Runtime Flow

```text
Detect skill
↓
Read skill.json
↓
Read SKILL.md
↓
Check permissions
↓
Inject skill context
↓
Run agent
↓
Log skill_run
```

## Security

- Scripts require explicit approval.
- Network permission is disabled by default.
- Skills cannot access secrets by default.
- Skill instructions cannot override system safety policies.
