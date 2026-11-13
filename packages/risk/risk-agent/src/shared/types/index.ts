/**
 * 跨层共享的品牌化标识类型与构造器。
 * 品牌化阻止结构相同的字符串在类型上互换（AGENTS.md「Opaque cross-boundary ids are branded」）。
 * @module
 */

import { brandString } from '@deepseek-ai/dsh-brand'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** 租户标识；隔离边界的唯一定位符（DOC-12 §3）。 */
export type TenantId = Branded<'TenantId'>

/** IANA 时区名；用于业务日与窗口换算（DOC-14 §4.1）。 */
export type IanaTimezone = Branded<'IanaTimezone'>

/** 不可变配置快照引用（DOC-14 §6.1、DOC-06 `ConfigSnapshotRef`）。 */
export type ConfigSnapshotRef = Branded<'ConfigSnapshotRef'>

/** 审计记录标识。 */
export type AuditRecordId = Branded<'AuditRecordId'>

/**
 * 为租户标识加上编译期品牌。
 * @param value - 已由可信入口确认的租户标识。
 * @returns 同一字符串的品牌化视图。
 */
export function toTenantId(value: string): TenantId {
  return brandString<TenantId>(value)
}

/**
 * 为时区名加上编译期品牌。
 * @param value - 已通过 IANA 校验的时区名。
 * @returns 同一字符串的品牌化视图。
 */
export function toIanaTimezone(value: string): IanaTimezone {
  return brandString<IanaTimezone>(value)
}

/**
 * 为配置快照引用加上编译期品牌。
 * @param value - 快照服务分配的引用字符串。
 * @returns 同一字符串的品牌化视图。
 */
export function toConfigSnapshotRef(value: string): ConfigSnapshotRef {
  return brandString<ConfigSnapshotRef>(value)
}

/**
 * 为审计记录标识加上编译期品牌。
 * @param value - 审计端口分配的记录标识。
 * @returns 同一字符串的品牌化视图。
 */
export function toAuditRecordId(value: string): AuditRecordId {
  return brandString<AuditRecordId>(value)
}
