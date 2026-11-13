/**
 * DSH 企业级风险监控 Agent（骨架）：装载即注册只读工具 `get_monitor_health`，
 * 卸载即注销并释放全部注册。命名导出保留 Loader 注入元数据。
 * 配置校验、快照与租户上下文经包根导出，供组合与测试复用。
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
  TenantResolver,
} from './tools/index.ts'
export { ERROR_CATEGORIES, AuthorizationError, InternalError, ValidationError } from './shared/index.ts'
export type {
  AuditRecordId,
  ConfigSnapshotRef,
  ErrorCategory,
  IanaTimezone,
  StructuredError,
  StructuredErrorOptions,
  TenantId,
} from './shared/index.ts'
export {
  CONFIG_AUDIT_ACTIONS,
  CONFIG_AUDIT_RESULTS,
  ConfigService,
  configSchema,
  createConfigSnapshot,
  hashConfig,
  validateConfig,
} from './application/config/index.ts'
export type {
  ConfigAuditAction,
  ConfigAuditEvent,
  ConfigAuditPort,
  ConfigAuditResult,
  ConfigSnapshot,
  ConfigUpdateFailure,
  ConfigValidation,
  ResolvedConfig,
} from './application/config/index.ts'
export { createTenantContext } from './domain/index.ts'
export type { TenantContext, TenantContextInput } from './domain/index.ts'
