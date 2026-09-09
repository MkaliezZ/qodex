import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { Scope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

const signal = new AbortController().signal
const NOW = '2026-08-13T22:42:00.000Z'

async function mount(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  return ctx
}

async function mintAgentScope(ctx: Context): Promise<{ scope: Scope; key: Agent }> {
  const key = { id: 'kerniq-dsh-spike-session' as SessionId } as Agent
  let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, key) }, {
    inject: ['tools', 'systemPrompt'],
  }))
  return { scope, key }
}

async function walk(root: string): Promise<string[]> {
  const output: string[] = []
  async function visit(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      output.push(relative)
      if (entry.isDirectory()) await visit(resolve(dir, entry.name), relative)
    }
  }
  await visit(root, '')
  return output.sort()
}

function textTool(name: string, body: () => Promise<string>) {
  return defineTool({
    name,
    description: `KerniQ DSH proof tool ${name}`,
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: body,
  })
}

describe('KerniQ v0.8.1 real pinned DSH governed ToolRuntime proof', () => {
  it('proves exact native surface and monotonic containment before emitting one proposal', async () => {
    const evidencePath = process.env.KERNIQ_DSH_RUNTIME_EVIDENCE
    const fixtureRoot = process.env.KERNIQ_DSH_READ_ONLY_FIXTURE
    expect(evidencePath).toBeTruthy()
    expect(fixtureRoot).toBeTruthy()
    if (!evidencePath || !fixtureRoot) throw new Error('missing governed proof environment')

    await mkdir(fixtureRoot, { recursive: true })
    const fixtureBefore = await walk(fixtureRoot)

    const ctx = await mount()
    const { scope, key } = await mintAgentScope(ctx)
    let inspectBodyCalls = 0
    let unreviewedBodyCalls = 0
    let escapeBodyCalls = 0
    let proposalBodyCalls = 0

    ctx.tools.register(textTool('inspect_project', async () => {
      inspectBodyCalls += 1
      return 'inspection-only'
    }))
    ctx.tools.register(textTool('unreviewed_native', async () => {
      unreviewedBodyCalls += 1
      return 'must-not-run'
    }))

    scope.ctx.tools.register(defineTool({
      name: 'propose_project_command',
      description: 'Emit a KerniQ-owned inert proof action proposal; never execute it in DSH.',
      parameters: {},
      output: {
        schema: { type: 'json' },
        render: () => [{ type: 'text', text: 'KerniQ proposal emitted.' }],
      },
      async execute() {
        proposalBodyCalls += 1
        return {
          actionId: 'dsh-proof-action-1',
          taskId: 'dsh-proof-task-1',
          sessionId: 'dsh-proof-session-1',
          actionType: 'kerniq.proof.increment-counter',
          title: 'DSH governed proof counter',
          summary: 'Increment one disposable in-memory KerniQ proof counter after approval and AgentFuse allow.',
          risk: 'write',
          parameters: {
            sandboxId: 'dsh-governed-proof',
            markerName: 'counter',
            contentDigest: 'sha256:fixture',
          },
          requestedAt: NOW,
        }
      },
    }))

    scope.ctx.tools.restrict({ allow: ['inspect_project'] })

    // Intentionally prove the documented DSH exemption first: a scope-owned
    // registration survives the inherited allow-list. The monotonic KerniQ
    // guard below must still stop it before its body.
    const liftEscape = scope.ctx.tools.register(textTool('scope_escape_probe', async () => {
      escapeBodyCalls += 1
      return 'must-not-run'
    }))
    expect(ctx.tools.schemas(key).map(tool => tool.name).sort())
      .toEqual(['inspect_project', 'propose_project_command', 'scope_escape_probe'])

    const governedNames = new Set(['inspect_project', 'propose_project_command'])
    ctx.tools.guard(exec => governedNames.has(exec.name) ? undefined : 'KerniQ monotonic governed-tool denial')

    const escaped = await ctx.tools.execute({
      signal,
      callId: CallId('scope-escape-probe'),
      name: 'scope_escape_probe',
      arguments: {},
      agent: key,
    })
    expect(escaped.isError).toBe(true)
    expect(escapeBodyCalls).toBe(0)
    liftEscape()

    const modelVisibleTools = ctx.tools.schemas(key).map(tool => tool.name).sort()
    expect(modelVisibleTools).toEqual(['inspect_project', 'propose_project_command'])
    expect(modelVisibleTools).not.toContain('run_code')

    let parentToken: unknown
    const stopCapture = ctx.on('tools/pre-execute', (exec, next) => {
      if (exec.callId === CallId('parent-inspect')) parentToken = exec.token
      return next()
    })
    const inspection = await ctx.tools.execute({
      signal,
      callId: CallId('parent-inspect'),
      name: 'inspect_project',
      arguments: {},
      agent: key,
    })
    stopCapture()
    expect(inspection.isError).toBe(false)
    expect(parentToken).toBeDefined()

    const directUnreviewed = await ctx.tools.execute({
      signal,
      callId: CallId('direct-unreviewed'),
      name: 'unreviewed_native',
      arguments: {},
      agent: key,
    })
    expect(directUnreviewed.isError).toBe(true)

    const nestedUnreviewed = await ctx.tools.execute({
      signal,
      callId: CallId('nested-unreviewed'),
      name: 'unreviewed_native',
      arguments: {},
      agent: key,
      parent: parentToken as never,
    })
    expect(nestedUnreviewed.isError).toBe(true)

    const runCodeProbe = await ctx.tools.execute({
      signal,
      callId: CallId('run-code-probe'),
      name: 'run_code',
      arguments: {},
      agent: key,
    })
    expect(runCodeProbe.isError).toBe(true)
    expect(unreviewedBodyCalls).toBe(0)

    const proposed = await ctx.tools.execute({
      signal,
      callId: CallId('proposal'),
      name: 'propose_project_command',
      arguments: {},
      agent: key,
    })
    expect(proposed.isError).toBe(false)
    expect(proposalBodyCalls).toBe(1)

    const fixtureAfter = await walk(fixtureRoot)
    expect(fixtureAfter).toEqual(fixtureBefore)

    await writeFile(evidencePath, JSON.stringify({
      schemaVersion: 'kerniq.dsh.runtime-core-proof.v0.8.1',
      observedDshCommit: '47f943859bef60e4160492346772ded9b24f765a',
      effectiveToolsMode: 'native',
      exactAllowedTools: ['inspect_project', 'propose_project_command'],
      modelVisibleTools,
      scopeOwnedRestrictionExemptionObserved: true,
      scopeEscapeProbeRejected: escaped.isError,
      scopeEscapeBodyExecutionCount: escapeBodyCalls,
      codeTransportVisible: modelVisibleTools.includes('run_code'),
      runCodeProbeRejected: runCodeProbe.isError,
      directNativeCallProbeRejected: directUnreviewed.isError,
      nestedUnreviewedCallProbeRejected: nestedUnreviewed.isError,
      monotonicGuardInstalled: true,
      monotonicGuardRejectedUnreviewedProbe: escaped.isError,
      deniedProbeBodyExecutionCount: escapeBodyCalls + unreviewedBodyCalls,
      fixtureBefore,
      fixtureAfter,
      directFixtureWrites: fixtureAfter.filter(path => !fixtureBefore.includes(path)),
      inspectBodyExecutionCount: inspectBodyCalls,
      proposalCount: proposalBodyCalls,
      dshDirectProductExecutionCount: 0,
      proposalInput: proposed.value,
    }, null, 2), 'utf8')
  })
})
