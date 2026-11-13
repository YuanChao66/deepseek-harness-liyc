/**
 * 测试用最小合法配置：只声明没有默认值的必填项，其余字段由 Schema 注入默认值。
 * TBD-001（告警阈值/采样基线）与 TBD-002（队列积压上限）尚未定稿，
 * 这里先给出可校验的占位值；定稿后在这两处回填，并同步 DOC-14。
 */

import { validateConfig } from '../src/application/config/index.ts'
import type { ResolvedConfig } from '../src/application/config/index.ts'

/** TBD-001 回填点：告警阈值的占位值。 */
export const TBD_001_ALERT_THRESHOLDS: Readonly<Record<string, number>> = { 'collection.queue.lag': 100 }

/** TBD-002 回填点：并发预算队列积压上限的占位值。 */
export const TBD_002_QUEUE_BACKLOG = 100

/**
 * 构造最小合法配置。
 * @param overrides - 顶层字段覆盖，用于构造非法用例。
 * @returns 可交给 `validateConfig` 的原始配置。
 */
export function minimalConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    concurrencyBudget: { queueBacklog: TBD_002_QUEUE_BACKLOG },
    observability: { alertThresholds: { ...TBD_001_ALERT_THRESHOLDS } },
    ...overrides,
  }
}

/**
 * 构造已通过 Schema 校验的完整配置。
 * 装载点要求完整的配置类型，而 `minimalConfig` 只给出必填项与默认值的原始值。
 * @param overrides - 顶层字段覆盖。
 * @returns 默认值已注入的配置。
 */
export function resolvedConfig(overrides: Record<string, unknown> = {}): ResolvedConfig {
  const result = validateConfig(minimalConfig(overrides))
  if (!result.ok) throw result.error
  return result.value
}

/**
 * 构造 MySQL 采集分支。
 * @param overrides - 分支字段覆盖。
 * @returns 合法的 `collectionConfig.mysql`。
 */
export function mysqlBranch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    host: 'db.internal',
    port: 3306,
    database: 'risk',
    tableWhitelist: ['risk_event'],
    columnWhitelist: { risk_event: ['id', 'updated_at'] },
    accountRef: { secretRef: 'secret/db-account', provider: 'vault' },
    ...overrides,
  }
}

/**
 * 构造 SSH 采集分支。
 * @param overrides - 分支字段覆盖。
 * @returns 合法的 `collectionConfig.ssh`。
 */
export function sshBranch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    host: 'bastion.internal',
    port: 22,
    user: 'ops',
    knownHosts: ['ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHost'],
    keyRef: { secretRef: 'secret/ssh-key', provider: 'vault' },
    commandTemplateWhitelist: ['uptime'],
    paramWhitelist: { uptime: ['host'] },
    ...overrides,
  }
}

/**
 * 构造日志采集分支。
 * @param overrides - 分支字段覆盖。
 * @returns 合法的 `collectionConfig.log`。
 */
export function logBranch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    path: '/var/log/app.log',
    parseRules: [{ name: 'level', pattern: '^(?<level>\\w+)' }],
    ...overrides,
  }
}

/**
 * 构造数据源；三个具体构造器共用同一骨架，避免用例之间出现结构漂移。
 * @param type - 数据源类型。
 * @param collectionConfig - 采集参数分支。
 * @param overrides - 数据源字段覆盖。
 * @returns 原始数据源配置。
 */
function dataSource(
  type: 'mysql' | 'ssh' | 'log',
  collectionConfig: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    dataSourceId: `ds-${type}`,
    tenantId: 'tenant-a',
    type,
    schedule: { cron: '0 */5 * * * *' },
    cursor: 'updated_at',
    connection: { secretRef: 'secret/db', provider: 'vault' },
    collectionConfig,
    ...overrides,
  }
}

/**
 * 构造一个合法的 MySQL 数据源。
 * @param overrides - 数据源字段覆盖。
 * @returns 原始数据源配置。
 */
export function mysqlDataSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return dataSource('mysql', { mysql: mysqlBranch() }, overrides)
}

/**
 * 构造一个合法的 SSH 数据源。
 * @param overrides - 数据源字段覆盖。
 * @returns 原始数据源配置。
 */
export function sshDataSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return dataSource('ssh', { ssh: sshBranch() }, overrides)
}

/**
 * 构造一个合法的日志数据源。
 * @param overrides - 数据源字段覆盖。
 * @returns 原始数据源配置。
 */
export function logDataSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return dataSource('log', { log: logBranch() }, overrides)
}
