/**
 * 配置审计（DOC-14 §7）：装载、热更新与回退都留痕。
 * 配置是部署级对象，`tenantId` 仅在按租户区分来源时出现（歧义 A-1）。
 * @module
 */

import type { AuditRecordId, TenantId } from '../../shared/index.ts'

/** 配置审计动作。 */
export const CONFIG_AUDIT_ACTIONS = ['config.load', 'config.reload', 'config.rollback'] as const

/** 配置审计动作类型。 */
export type ConfigAuditAction = (typeof CONFIG_AUDIT_ACTIONS)[number]

/** 配置审计结果。 */
export const CONFIG_AUDIT_RESULTS = ['SUCCESS', 'FAILED'] as const

/** 配置审计结果类型。 */
export type ConfigAuditResult = (typeof CONFIG_AUDIT_RESULTS)[number]

/** 一条配置审计事件。 */
export interface ConfigAuditEvent {
  /** 动作。 */
  readonly action: ConfigAuditAction
  /** 结果。 */
  readonly result: ConfigAuditResult
  /** 相关配置版本；失败时为本次尝试的版本。 */
  readonly version: number
  /** 事件时间（epoch 毫秒）。 */
  readonly at: number
  /** 相关快照的内容哈希；失败且无 LKG 时为 undefined。 */
  readonly contentHash: string | undefined
  /** 失败原因码；成功时为 undefined。 */
  readonly errorCode: string | undefined
  /** 失败消息；成功时为 undefined。 */
  readonly message: string | undefined
  /** 来源租户；部署级配置事件为 undefined。 */
  readonly tenantId: TenantId | undefined
}

/** 配置审计端口。 */
export interface ConfigAuditPort {
  /**
   * 追加一条配置审计事件。
   * @param event - 待记录的事件。
   * @returns 审计记录标识。
   */
  record(event: ConfigAuditEvent): AuditRecordId
}
