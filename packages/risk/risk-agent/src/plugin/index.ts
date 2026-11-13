/**
 * 风险监控 Agent 插件入口：Loader 校验配置后装配运行时，并注册只读工具
 * `get_monitor_health`。卸载时 Cordis 释放工具注册与运行时。
 * @module @deepseek-ai/dsh-risk-agent
 */

import type { Context } from '@deepseek-ai/cordis'
import { validateConfig } from '../application/config/index.ts'
import type { ResolvedConfig } from '../application/config/index.ts'
import { defineGetMonitorHealthTool } from '../tools/index.ts'
import { createRiskAgentRuntime } from './composition/index.ts'

/** Cordis 插件名。 */
export const name = 'risk-agent'

/** 依赖的工具服务。 */
export const inject = ['tools']

/**
 * 插件配置校验器；Loader 在调用 `apply` 前完成校验与默认值注入。
 * 与 `validateConfig` 共用同一条 fail-loud 路径，因此未知字段同样在装载期被拒绝，
 * 而不是被静默丢弃。
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-risk-agent',
    validate(value: unknown) {
      const result = validateConfig(value)
      if (result.ok) return { value: result.value }
      return {
        issues: [{
          message: `${result.error.code}: ${result.error.message}`,
          path: [result.error.fieldPath],
        }],
      }
    },
  },
} as const

/**
 * 装配运行时并注册工具。
 * @param ctx - Cordis 上下文。
 * @param input - 已校验并注入默认值的配置。
 */
export function apply(ctx: Context, input: ResolvedConfig): void {
  const startedAt = Date.now()
  const runtime = createRiskAgentRuntime({ config: input, now: Date.now })
  ctx.tools.register(defineGetMonitorHealthTool(startedAt, claimed => runtime.resolveTenant(claimed)))
}
