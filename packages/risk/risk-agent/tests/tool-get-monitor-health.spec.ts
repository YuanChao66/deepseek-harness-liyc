/**
 * `get_monitor_health` 契约测试（ID_PENDING）：入参校验、错误映射、渲染。
 * 红线 9：未命中与 UNKNOWN 是正常结果，不得包装成异常。
 */

import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'

import type { MonitorHealthResult } from '../src/index.ts'
import * as riskAgent from '../src/index.ts'

let sequence = 0

/**
 * 在真实工具运行时上装载插件。
 * @returns 根上下文。
 */
async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(riskAgent)
  return ctx
}

/**
 * 调用 `get_monitor_health`。
 * @param ctx - 已装载插件的上下文。
 * @param args - 原始入参。
 * @returns 归一化后的工具结果。
 */
function callHealth(ctx: Context, args: unknown) {
  return executeToolFixture(ctx, {
    signal: new AbortController().signal,
    callId: ToolCallId(`health-${++sequence}`),
    name: 'get_monitor_health',
    arguments: args,
  })
}

/**
 * 取出成功结果的契约值。
 * @param result - 归一化后的工具结果。
 * @returns 契约结果。
 */
function valueOf(result: Awaited<ReturnType<typeof callHealth>>): MonitorHealthResult {
  if (result.isError) throw new Error('expected get_monitor_health success')
  return result.value as MonitorHealthResult
}

function textOf(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

describe('get_monitor_health', () => {
  it('[ID_PENDING] 模型侧 schema 暴露三个可选过滤字段', async () => {
    const ctx = await setup()
    const schema = ctx.tools.schemas().find(s => s.name === 'get_monitor_health')
    expect(schema).toBeDefined()
    const parameters = schema!.parameters as { properties?: Record<string, unknown>; required?: string[] }
    expect(Object.keys(parameters.properties ?? {}).sort()).toEqual(['components', 'dataSources', 'tenantId'])
    expect(parameters.required ?? []).toEqual([])
    await ctx.fiber.dispose()
  })

  it('[ID_PENDING] 零组件时返回 UNKNOWN、四点计数为 0、dataSources 为空', async () => {
    const ctx = await setup()
    const value = valueOf(await callHealth(ctx, {}))

    expect(value.health).toBe('UNKNOWN')
    expect(value.plugin.status).toBe('RUNNING')
    expect(value.plugin.uptimeSec).toBeGreaterThanOrEqual(0)
    expect(value.dataSources).toEqual([])
    expect(value.coverage).toEqual({ configured: 0, enabled: 0, normal: 0, degraded: 0 })
    await ctx.fiber.dispose()
  })

  it('[ID_PENDING] 过滤入参未命中仍是正常结果而非异常', async () => {
    const ctx = await setup()
    const value = valueOf(await callHealth(ctx, {
      components: ['nonexistent-component'],
      dataSources: ['nonexistent-source'],
      tenantId: 'ignored-hint',
    }))

    expect(value.health).toBe('UNKNOWN')
    expect(value.dataSources).toEqual([])
    expect(value.coverage).toEqual({ configured: 0, enabled: 0, normal: 0, degraded: 0 })
    await ctx.fiber.dispose()
  })

  it('[ID_PENDING] 入参类型错误被映射为 INVALID_ARGS 失败', async () => {
    const ctx = await setup()
    const result = await callHealth(ctx, { components: 'not-an-array' })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('invalid arguments')
    await ctx.fiber.dispose()
  })

  it('[ID_PENDING] 渲染文本包含健康状态与四点计数', async () => {
    const ctx = await setup()
    const result = await callHealth(ctx, {})

    const text = textOf(result)
    expect(text).toContain('UNKNOWN')
    expect(text).toContain('configured=0')
    expect(text).toContain('enabled=0')
    expect(text).toContain('normal=0')
    expect(text).toContain('degraded=0')
    await ctx.fiber.dispose()
  })

  it('[ID_PENDING] 只读且幂等：两次调用结果一致', async () => {
    const ctx = await setup()
    const first = valueOf(await callHealth(ctx, {}))
    const second = valueOf(await callHealth(ctx, {}))

    expect(second.health).toBe(first.health)
    expect(second.dataSources).toEqual(first.dataSources)
    expect(second.coverage).toEqual(first.coverage)
    expect(second.plugin.uptimeSec).toBeGreaterThanOrEqual(first.plugin.uptimeSec)
    await ctx.fiber.dispose()
  })
})
