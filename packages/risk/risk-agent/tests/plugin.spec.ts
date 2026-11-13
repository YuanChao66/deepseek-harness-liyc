/**
 * 插件生命周期测试（ID_PENDING）：装载、发现、调用、注销与资源释放、超时取消。
 * 除 agent 包装外全部使用真实组件：真实 ToolRuntime、真实 Native 执行器、真实插件体。
 */

import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { TOOL_ABORTED_BEFORE_DISPATCH } from '@deepseek-ai/dsh-tools'

import * as riskAgent from '../src/index.ts'
import { minimalConfig } from './config-fixture.ts'

let sequence = 0

/**
 * 在真实工具运行时上装载插件。
 * @returns 根上下文与插件 fiber。
 */
async function setup(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  // ToolRuntime 声明 inject = ['systemPrompt']，未满足时 Cordis 挂起而不报错，必须先挂。
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  const fiber = ctx.plugin(riskAgent, minimalConfig())
  await fiber
  return { ctx, fiber }
}

/**
 * 调用 `get_monitor_health`。
 * @param ctx - 已装载插件的上下文。
 * @param signal - 调用方取消信号。
 * @returns 归一化后的工具结果。
 */
function callHealth(ctx: Context, signal: AbortSignal = new AbortController().signal) {
  return executeToolFixture(ctx, {
    signal,
    callId: ToolCallId(`health-${++sequence}`),
    name: 'get_monitor_health',
    arguments: {},
  })
}

describe('risk-agent 插件生命周期', () => {
  it('[ID_PENDING] 装载后工具可发现且可调用', async () => {
    const { ctx } = await setup()
    const schema = ctx.tools.schemas().find(s => s.name === 'get_monitor_health')
    expect(schema).toBeDefined()

    const result = await callHealth(ctx)
    expect(result.isError).toBe(false)
    await ctx.fiber.dispose()
  })

  it('[ID_PENDING] 卸载插件后工具从注册表消失', async () => {
    const { ctx, fiber } = await setup()
    expect(ctx.tools.schemas().some(s => s.name === 'get_monitor_health')).toBe(true)

    await fiber.dispose()
    expect(ctx.tools.schemas().some(s => s.name === 'get_monitor_health')).toBe(false)
    await ctx.fiber.dispose()
  })

  it('[ID_PENDING] 调用前已取消的信号使调用以失败收尾而不进入工具体', async () => {
    const { ctx } = await setup()
    const controller = new AbortController()
    controller.abort()

    const result = await callHealth(ctx, controller.signal)
    expect(result.isError).toBe(true)
    // 截止时间由外部 timeout policy 在 exec.signal 上实施；本插件只需原样转交该信号。
    expect(result.error?.info).toMatchObject({ code: TOOL_ABORTED_BEFORE_DISPATCH })
    await ctx.fiber.dispose()
  })
})
