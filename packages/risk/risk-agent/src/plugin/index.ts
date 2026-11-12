/**
 * plugin 装配层：risk-agent 的 Cordis 入口与唯一装配点。
 * 仅此处接触 Cordis 上下文（红线：dsh-* 运行时 API 只在 plugin 层使用）。
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineGetMonitorHealthTool } from '../tools/index.ts'

/** Cordis 插件名。 */
export const name = 'risk-agent'

/** 依赖的 Cordis 服务。 */
export const inject = ['tools']

/** 插件配置：骨架阶段无可配置项，后续按 DOC-14 增加数据源与阈值字段。 */
export interface Config {
  // 刻意为空：当前没有需要部署方选择的开关或阈值。
}

/** Schemastery 配置声明。 */
export const Config: z<Config> = z.object({})

/**
 * 装配并注册 `get_monitor_health` 工具；返回的注册随插件 fiber 释放而注销。
 * @param ctx - 提供工具注册表的插件上下文。
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineGetMonitorHealthTool(Date.now()))
}
