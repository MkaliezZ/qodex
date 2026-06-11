# Qodex Skill DSL EBNF

## Purpose

Qodex Skills are reusable workflow packages.

A skill is a directory with:

```text
skill.json
SKILL.md
resources/
scripts/
```

---

# Skill Manifest JSON

Required file:

```text
skill.json
```

Example:

```json
{
  "name": "code-review",
  "version": "0.1.0",
  "description": "Review code for consistency, maintainability, and safety.",
  "entry": "SKILL.md",
  "permissions": {
    "file_read": true,
    "file_write": false,
    "shell": false,
    "network": false,
    "git": false
  },
  "activation": {
    "manual": "$code-review",
    "auto_keywords": ["review", "audit", "检查代码"]
  }
}
```

---

# SKILL.md Structure

```text
# Skill Name

## Purpose

## When to Use

## Instructions

## Inputs

## Outputs

## Safety Rules

## Examples
```

---

# EBNF

```ebnf
SkillDocument     = Heading, Section* ;

Heading           = "#", Space, Text, Newline ;

Section           = PurposeSection
                  | WhenToUseSection
                  | InstructionSection
                  | InputSection
                  | OutputSection
                  | SafetySection
                  | ExampleSection
                  | CustomSection ;

PurposeSection    = "## Purpose", Newline, MarkdownBlock ;
WhenToUseSection  = "## When to Use", Newline, MarkdownBlock ;
InstructionSection= "## Instructions", Newline, MarkdownBlock ;
InputSection      = "## Inputs", Newline, MarkdownBlock ;
OutputSection     = "## Outputs", Newline, MarkdownBlock ;
SafetySection     = "## Safety Rules", Newline, MarkdownBlock ;
ExampleSection    = "## Examples", Newline, MarkdownBlock ;
CustomSection     = "##", Space, Text, Newline, MarkdownBlock ;

MarkdownBlock     = { Line } ;
Line              = { Character }, Newline ;
Text              = Character, { Character } ;
Space             = " " ;
Newline           = "\n" ;
Character         = ? any unicode character ? ;
```

---

# Variable Syntax

Skills may use variables:

```text
{{project.name}}
{{project.path}}
{{task.prompt}}
{{git.branch}}
{{context.files}}
```

EBNF:

```ebnf
Variable          = "{{", Identifier, { ".", Identifier }, "}}" ;
Identifier        = Letter, { Letter | Digit | "_" | "-" } ;
```

---

# Skill Activation Syntax

Manual activation:

```text
$skill-name user instruction
```

EBNF:

```ebnf
SkillInvocation   = "$", SkillName, [ Space, InvocationText ] ;
SkillName         = LowerAlpha, { LowerAlpha | Digit | "-" } ;
InvocationText    = { Character } ;
```

---

# Permission Semantics

Permissions:

```text
file_read
file_write
shell
network
git
mcp
```

Rules:

1. Missing permission means false.
2. Script execution requires shell permission.
3. Network access requires network permission.
4. File write still requires user approval even if permission is true.
5. Skill instructions cannot override Qodex safety policy.

---

# Skill Resolution Algorithm

```text
1. Check manual $skill invocation.
2. If none, scan prompt against auto_keywords.
3. If project default skills exist, add them.
4. Load manifest.
5. Validate permissions.
6. Inject SKILL.md into model context.
7. Log skill_run.
```

---

# Skill Package Compatibility

A valid skill package must:

- contain `skill.json`
- contain entry markdown file
- use valid name
- declare permissions
- avoid absolute file paths
- avoid hidden network behavior

---

# Reserved Skill Names

```text
system
qodex
agent
provider
mcp
runtime
```
