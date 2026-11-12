/**
 * 真实 Loader 组合测试（ID_PENDING）：通过 cordis.yml 经真实 Loader 装载 risk-agent，
 * 核验生命周期、动态注册/注销、错误映射与取消语义。结论作为 DOC-16 的事实输入。
 */

import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import type { ModuleLoaderV2 } from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'

import * as RiskAgent from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * 经真实 Loader 引导一份携带 risk-agent 的 cordis.yml。
 * @returns 引导完成的上下文。
 */
async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-risk-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-tool-executor-native'",
    "- name: '@deepseek-ai/dsh-risk-agent'",
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, object>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-tool-executor-native', NativeToolExecutor],
    ['@deepseek-ai/dsh-risk-agent', RiskAgent],
  ])
  // 只实现 import 的 v2 形状桩：Loader 装载路径只调用 import，其余成员按接口显式拒绝。
  const internal: ModuleLoaderV2 = {
    version: 'v2',
    loadCache: new Map(),
    async import(specifier: string) {
      const module = modules.get(specifier)
      if (module === undefined) throw new Error(`unexpected Loader import: ${specifier}`)
      return module
    },
    register() {
      throw new Error('register is not supported by the test loader stub')
    },
    async getOrCreateModuleJob() {
      throw new Error('getOrCreateModuleJob is not supported by the test loader stub')
    },
    resolveSync() {
      throw new Error('resolveSync is not supported by the test loader stub')
    },
    async load() {
      throw new Error('load is not supported by the test loader stub')
    },
  }
  ctx.loader.internal = internal
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  return ctx
}

let sequence = 0

/**
 * 调用 `get_monitor_health`。
 * @param ctx - 已引导的上下文。
 * @param args - 原始入参。
 * @param signal - 调用方取消信号。
 * @returns 归一化后的工具结果。
 */
function callHealth(ctx: Context, args: unknown, signal: AbortSignal = new AbortController().signal) {
  return executeToolFixture(ctx, {
    signal,
    callId: ToolCallId(`loader-health-${++sequence}`),
    name: 'get_monitor_health',
    arguments: args,
  })
}

describe('risk-agent 真实 Loader 组合', () => {
  it('[ID_PENDING] cordis.yml 无配置装载成功，工具可发现且零组件调用返回契约结果', async () => {
    const ctx = await boot()
    expect(ctx.tools.schemas().some(s => s.name === 'get_monitor_health')).toBe(true)

    const result = await callHealth(ctx, {})
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected get_monitor_health success')
    expect(result.value).toMatchObject({
      health: 'UNKNOWN',
      plugin: { status: 'RUNNING' },
      dataSources: [],
      coverage: { configured: 0, enabled: 0, normal: 0, degraded: 0 },
    })
  }, 30_000)

  it('[ID_PENDING] 卸载插件条目后工具从注册表消失（动态注销）', async () => {
    const ctx = await boot()
    const entry = ctx.loader.entries().find(e => e.options.name === '@deepseek-ai/dsh-risk-agent')
    expect(entry).toBeDefined()

    await entry!.fiber?.dispose()
    expect(ctx.tools.schemas().some(s => s.name === 'get_monitor_health')).toBe(false)
  }, 30_000)

  it('[ID_PENDING] 非法入参与已取消信号都映射为失败结果而非未捕获异常', async () => {
    const ctx = await boot()

    const invalid = await callHealth(ctx, { dataSources: 'not-an-array' })
    expect(invalid.isError).toBe(true)

    const controller = new AbortController()
    controller.abort()
    const cancelled = await callHealth(ctx, {}, controller.signal)
    expect(cancelled.isError).toBe(true)
  }, 30_000)
})
