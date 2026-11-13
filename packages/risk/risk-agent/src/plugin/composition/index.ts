/**
 * 插件组合根：把配置快照、可信租户解析与内存审计装配成运行时。
 * 组合根属于 plugin 层，因此可以直接持有应用服务与端口实现。
 * @module
 */

import { ConfigService } from '../../application/config/index.ts'
import type { ConfigAuditEvent, ConfigAuditPort, ConfigSnapshot, ResolvedConfig } from '../../application/config/index.ts'
import { establishTenantContext } from '../../application/security/index.ts'
import type { TenantContext } from '../../domain/index.ts'
import { toAuditRecordId } from '../../shared/index.ts'
import type { AuditRecordId } from '../../shared/index.ts'

/** 未配置 `tenants` 时的单租户标识（DOC-14 §4.2）。 */
export const SINGLE_TENANT_ID = 'default'

/** 内存配置审计日志。 */
export interface ConfigAuditLog extends ConfigAuditPort {
  /** 已记录的审计事件（按发生顺序）。 */
  readonly events: readonly ConfigAuditEvent[]
}

/**
 * 创建进程内配置审计日志。
 * @returns 带只读事件视图的审计端口。
 */
export function createMemoryConfigAudit(): ConfigAuditLog {
  const events: ConfigAuditEvent[] = []
  return {
    get events(): readonly ConfigAuditEvent[] {
      return events
    },
    record(event: ConfigAuditEvent): AuditRecordId {
      events.push(event)
      return toAuditRecordId(`audit:${events.length}`)
    },
  }
}

/**
 * 由配置推导可信租户身份。
 * 单租户模式返回固定标识；多租户模式必须恰有一个启用租户，否则 fail-closed。
 * @param service - 已装载的配置服务。
 * @returns 可信租户标识；无法唯一确定时为 undefined。
 */
export function resolveConfiguredIdentity(service: ConfigService): string | undefined {
  const tenants = service.current().value.tenants
  if (tenants.length === 0) return SINGLE_TENANT_ID
  const enabled = tenants.filter(tenant => tenant.enabled)
  if (enabled.length > 1) return undefined
  return enabled[0]?.tenantId
}

/** 风险 Agent 运行时。 */
export interface RiskAgentRuntime {
  /** 配置快照服务。 */
  readonly config: ConfigService
  /** 配置审计日志。 */
  readonly audit: ConfigAuditLog
  /**
   * 由可信入口建立租户上下文。
   * @param claimedTenantId - 调用方声称的租户标识，仅用于比对。
   * @returns 冻结的租户上下文。
   */
  resolveTenant(claimedTenantId?: string): TenantContext
  /**
   * 热更新配置。
   * @param raw - 原始配置值。
   * @returns 新快照；失败时抛出 `ValidationError` 并保留 LKG。
   */
  reload(raw: unknown): ConfigSnapshot
}

/** 运行时装配参数。 */
export interface RiskAgentRuntimeOptions {
  /** 已由 Loader 校验并注入默认值的配置。 */
  readonly config: ResolvedConfig
  /** 时钟，注入以便测试。 */
  readonly now: () => number
}

/**
 * 装配风险 Agent 运行时。
 * @param options - 已校验配置与时钟。
 * @returns 运行时。
 */
export function createRiskAgentRuntime(options: RiskAgentRuntimeOptions): RiskAgentRuntime {
  const audit = createMemoryConfigAudit()
  const config = new ConfigService(audit, options.now)
  config.load(options.config)
  return {
    config,
    audit,
    resolveTenant(claimedTenantId?: string): TenantContext {
      const tenantId = resolveConfiguredIdentity(config)
      return establishTenantContext({
        identity: tenantId === undefined ? undefined : { tenantId },
        snapshot: config.current(),
        claimedTenantId,
      })
    },
    reload(raw: unknown): ConfigSnapshot {
      return config.reload(raw)
    },
  }
}
