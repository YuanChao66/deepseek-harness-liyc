/**
 * 配置装载与热更新（DOC-14 §7）：校验 → 生成快照 → 原子切换 → 审计；
 * 失败时保留上一份成功快照（LKG），失败原因可查。
 * @module
 */

import { InternalError } from '../../shared/index.ts'
import { createConfigSnapshot } from './snapshot.ts'
import type { ConfigSnapshot } from './snapshot.ts'
import type { ConfigAuditAction, ConfigAuditPort } from './audit.ts'
import { validateConfig } from './validation.ts'

/** 最近一次装载/热更新失败的可查原因。 */
export interface ConfigUpdateFailure {
  /** 失败时间（epoch 毫秒）。 */
  readonly at: number
  /** 失败的动作。 */
  readonly action: ConfigAuditAction
  /** 稳定错误码。 */
  readonly code: string
  /** 用户可读消息。 */
  readonly message: string
  /** 出错字段路径。 */
  readonly fieldPath: string
}

/** 配置快照服务：持有当前快照与最近失败原因。 */
export class ConfigService {
  private snapshot: ConfigSnapshot | undefined
  private failure: ConfigUpdateFailure | undefined
  /**
   * 装载尝试计数。失败的热更新同样消耗一个版本号，
   * 使审计中的失败与后续成功事件不会共用同一版本而无法区分。
   */
  private attempts = 0

  /**
   * @param audit - 配置审计端口。
   * @param now - 时钟，注入以便测试。
   */
  constructor(
    private readonly audit: ConfigAuditPort,
    private readonly now: () => number,
  ) {}

  /**
   * 首次装载配置。
   * @param raw - 原始配置值。
   * @returns 新生成的快照。
   */
  load(raw: unknown): ConfigSnapshot {
    return this.apply(raw, 'config.load')
  }

  /**
   * 热更新配置；失败时保留 LKG 并记录回退审计。
   * @param raw - 原始配置值。
   * @returns 新生成的快照。
   */
  reload(raw: unknown): ConfigSnapshot {
    return this.apply(raw, 'config.reload')
  }

  /**
   * 读取当前生效快照。
   * @returns 当前快照。
   */
  current(): ConfigSnapshot {
    if (this.snapshot === undefined) {
      throw new InternalError('configNotLoaded', '配置尚未装载。')
    }
    return this.snapshot
  }

  /**
   * 读取最近一次失败原因。
   * @returns 失败详情；从未失败或已被后续成功装载清除时为 undefined。
   */
  lastFailure(): ConfigUpdateFailure | undefined {
    return this.failure
  }

  private apply(raw: unknown, action: ConfigAuditAction): ConfigSnapshot {
    const at = this.now()
    const version = ++this.attempts
    const result = validateConfig(raw)
    if (!result.ok) {
      const error = result.error
      this.audit.record({
        action,
        result: 'FAILED',
        version,
        at,
        contentHash: undefined,
        errorCode: error.code,
        message: error.message,
        tenantId: undefined,
      })
      const lkg = this.snapshot
      if (lkg !== undefined) {
        this.audit.record({
          action: 'config.rollback',
          result: 'SUCCESS',
          version: lkg.version,
          at,
          contentHash: lkg.contentHash,
          errorCode: error.code,
          message: error.message,
          tenantId: undefined,
        })
      }
      this.failure = { at, action, code: error.code, message: error.message, fieldPath: error.fieldPath }
      throw error
    }
    const next = createConfigSnapshot(result.value, version, at)
    this.audit.record({
      action,
      result: 'SUCCESS',
      version,
      at,
      contentHash: next.contentHash,
      errorCode: undefined,
      message: undefined,
      tenantId: undefined,
    })
    this.snapshot = next
    this.failure = undefined
    return next
  }
}
