/**
 * 不可变配置快照（DOC-14 §6.1）：版本单调递增，内容哈希定位同一份内容，
 * 已发布快照不被热更新改写。
 * @module
 */

import { createHash } from 'node:crypto'
import { toConfigSnapshotRef } from '../../shared/index.ts'
import type { ConfigSnapshotRef } from '../../shared/index.ts'
import type { ResolvedConfig } from './schema.ts'

/** 一次成功装载得到的不可变配置快照。 */
export interface ConfigSnapshot {
  /** `config:v<version>:<hash 前缀>` 形式的快照引用。 */
  readonly ref: ConfigSnapshotRef
  /** 单调递增的配置版本。 */
  readonly version: number
  /** 归一化配置的 SHA-256 内容哈希。 */
  readonly contentHash: string
  /** 冻结后的归一化配置。 */
  readonly value: ResolvedConfig
  /** 快照创建时间（epoch 毫秒）。 */
  readonly createdAt: number
}

/**
 * 计算归一化配置的内容哈希。
 * @param value - 已注入默认值的配置。
 * @returns 十六进制 SHA-256。
 */
export function hashConfig(value: ResolvedConfig): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/**
 * 冻结配置树；`null` 已在 `validateConfig` 阶段被拒绝。
 * @param value - 待冻结的值。
 * @returns 同一引用，其对象与数组已递归冻结。
 */
function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item)
    Object.freeze(value)
    return value
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item)
    Object.freeze(value)
  }
  return value
}

/**
 * 由归一化配置创建不可变快照。
 * @param value - 已注入默认值的配置。
 * @param version - 本次装载的版本号。
 * @param now - 创建时间（epoch 毫秒）。
 * @returns 冻结的快照。
 */
export function createConfigSnapshot(value: ResolvedConfig, version: number, now: number): ConfigSnapshot {
  const contentHash = hashConfig(value)
  return Object.freeze({
    ref: toConfigSnapshotRef(`config:v${version}:${contentHash.slice(0, 12)}`),
    version,
    contentHash,
    value: deepFreeze(value),
    createdAt: now,
  })
}
