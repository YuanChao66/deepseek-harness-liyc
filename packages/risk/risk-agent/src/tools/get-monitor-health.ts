/**
 * 只读工具 `get_monitor_health` 的模型侧定义（DOC-08 §3.9）。
 * 骨架阶段不接入任何组件与数据源：按契约返回零覆盖快照，`UNKNOWN` 表示“未配置”，
 * 未命中与未知状态属于正常结果，不以异常表达（红线 9）。
 * @module
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

/** 监控健康状态的全部合法取值（单点定义，DOC-03 §6）。 */
export const MONITOR_HEALTH_VALUES = ['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN'] as const

/** 监控健康状态。 */
export type MonitorHealth = (typeof MONITOR_HEALTH_VALUES)[number]

/** 插件自身健康信息。 */
export interface MonitorPluginStatus {
  /** 插件运行状态。 */
  status: string
  /** 插件装载以来的秒数。 */
  uptimeSec: number
}

/** 单个数据源的健康状态。 */
export interface DataSourceHealth {
  /** 数据源标识。 */
  sourceId: string
  /** 数据源状态。 */
  status: string
  /** 最近一次检查时间（ISO 8601）。 */
  lastCheckedAt: string
  /** 附加说明。 */
  message?: string
}

/** 监控覆盖四点计数。 */
export interface MonitoringCoverage {
  /** 已配置组件数。 */
  configured: number
  /** 已启用组件数。 */
  enabled: number
  /** 正常组件数。 */
  normal: number
  /** 降级组件数。 */
  degraded: number
}

/** `get_monitor_health` 的契约结果（DOC-08 §3.9）。 */
export interface MonitorHealthResult {
  /** 总体健康状态。 */
  health: MonitorHealth
  /** 插件自身健康。 */
  plugin: MonitorPluginStatus
  /** 各数据源健康；未配置时为空数组。 */
  dataSources: DataSourceHealth[]
  /** 覆盖计数；未配置时全为 0。 */
  coverage: MonitoringCoverage
}

/**
 * 生成零组件下的健康快照：未配置不计为健康（UNKNOWN），覆盖计数全 0。
 * @param startedAt - 插件装载时刻（Unix 毫秒）。
 * @param now - 当前时刻（Unix 毫秒）。
 * @returns 契约完整的健康快照。
 */
export function zeroMonitorHealth(startedAt: number, now: number): MonitorHealthResult {
  return {
    health: 'UNKNOWN',
    plugin: { status: 'RUNNING', uptimeSec: Math.max(0, Math.floor((now - startedAt) / 1000)) },
    dataSources: [],
    coverage: { configured: 0, enabled: 0, normal: 0, degraded: 0 },
  }
}

/**
 * 构造 `get_monitor_health` 工具定义。工具为只读、幂等；骨架阶段忽略全部过滤入参，
 * `tenantId` 仅为契约保留字段，不作为租户依据（红线 4：租户必须来自可信入口）。
 * @param startedAt - 插件装载时刻（Unix 毫秒），用于计算 uptimeSec。
 * @returns 可注册的工具定义。
 */
export function defineGetMonitorHealthTool(startedAt: number): ToolDefinition {
  return defineTool({
    name: 'get_monitor_health',
    description:
      'Read the risk monitor health: overall status, plugin uptime, per-data-source status, '
      + 'and coverage counts (configured/enabled/normal/degraded). Read-only and idempotent; '
      + 'a deployment with nothing configured reports UNKNOWN with zero counts.',
    parameters: {
      components: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional component ids to filter the report. Reserved; no components exist yet.',
      },
      dataSources: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional data source ids to filter the report. Reserved; no data sources exist yet.',
      },
      tenantId: {
        type: 'string',
        description: 'Reserved contract hint, accepted and ignored; tenancy comes from the trusted entry, never from tool arguments.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          health: { type: 'string', required: true, enum: [...MONITOR_HEALTH_VALUES], description: 'Overall monitor health.' },
          plugin: {
            type: 'object',
            required: true,
            additionalProperties: false,
            description: 'Plugin self-health.',
            properties: {
              status: { type: 'string', required: true, description: 'Plugin runtime status.' },
              uptimeSec: { type: 'number', required: true, description: 'Seconds since the plugin was loaded.' },
            },
          },
          dataSources: {
            type: 'array',
            required: true,
            description: 'Per-data-source health; empty when none are configured.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                sourceId: { type: 'string', required: true, description: 'Data source id.' },
                status: { type: 'string', required: true, description: 'Data source status.' },
                lastCheckedAt: { type: 'string', required: true, description: 'Last check time (ISO 8601).' },
                message: { type: 'string', description: 'Optional detail.' },
              },
            },
          },
          coverage: {
            type: 'object',
            required: true,
            additionalProperties: false,
            description: 'Coverage counts across monitored components.',
            properties: {
              configured: { type: 'number', required: true, description: 'Configured components.' },
              enabled: { type: 'number', required: true, description: 'Enabled components.' },
              normal: { type: 'number', required: true, description: 'Healthy components.' },
              degraded: { type: 'number', required: true, description: 'Degraded components.' },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `monitor health: ${value.health}; plugin ${value.plugin.status} up ${value.plugin.uptimeSec}s; `
          + `coverage configured=${value.coverage.configured} enabled=${value.coverage.enabled} `
          + `normal=${value.coverage.normal} degraded=${value.coverage.degraded}; `
          + `data sources: ${value.dataSources.length}`,
      }],
    },
    // oxlint-disable-next-line typescript/require-await -- 工具 execute 契约返回 Promise；骨架阶段快照是同步读取。
    async execute(_args, _exec) {
      return zeroMonitorHealth(startedAt, Date.now())
    },
  })
}
