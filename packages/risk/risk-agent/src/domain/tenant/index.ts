/**
 * 租户上下文（DOC-12 §3.2）：只由可信边界建立，工具入参不得直接构造。
 * @module
 */

import { toConfigSnapshotRef, toIanaTimezone, toTenantId } from '../../shared/index.ts'
import type { ConfigSnapshotRef, IanaTimezone, TenantId } from '../../shared/index.ts'

/** 一次调用所依据的租户身份与配置版本。 */
export interface TenantContext {
  /** 可信租户标识。 */
  readonly tenantId: TenantId
  /** 该租户业务日换算使用的时区。 */
  readonly timezone: IanaTimezone
  /** 建立上下文时生效的配置快照引用。 */
  readonly configSnapshotRef: ConfigSnapshotRef | undefined
}

/** 建立租户上下文的原始输入。 */
export interface TenantContextInput {
  /** 已由可信入口确认的租户标识。 */
  readonly tenantId: string
  /** 已解析的 IANA 时区。 */
  readonly timezone: string
  /** 当前生效快照的引用。 */
  readonly configSnapshotRef: string | undefined
}

/**
 * 构造不可变的租户上下文。
 * @param input - 可信身份、解析后的时区与快照引用。
 * @returns 冻结的租户上下文。
 */
export function createTenantContext(input: TenantContextInput): TenantContext {
  return Object.freeze({
    tenantId: toTenantId(input.tenantId),
    timezone: toIanaTimezone(input.timezone),
    configSnapshotRef: input.configSnapshotRef === undefined
      ? undefined
      : toConfigSnapshotRef(input.configSnapshotRef),
  })
}
