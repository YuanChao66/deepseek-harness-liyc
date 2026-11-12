/**
 * DSH 企业级风险监控 Agent（骨架）：装载即注册只读工具 `get_monitor_health`，
 * 卸载即注销并释放全部注册。命名导出保留 Loader 注入元数据。
 * @module @deepseek-ai/dsh-risk-agent
 */

export { name, inject, Config, apply } from './plugin/index.ts'
export { MONITOR_HEALTH_VALUES } from './tools/index.ts'
export type {
  DataSourceHealth,
  MonitorHealth,
  MonitorHealthResult,
  MonitorPluginStatus,
  MonitoringCoverage,
} from './tools/index.ts'
