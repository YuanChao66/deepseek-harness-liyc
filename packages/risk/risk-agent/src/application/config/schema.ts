/**
 * 配置 Schema（DOC-14 §4）：只做类型、取值域、默认值与范围校验；
 * 跨字段不变量由 `validation.ts` 补齐。schemastery 不拒绝未知字段，
 * 因此未知字段检测也在 `validation.ts` 中显式完成。
 * @module
 */

import z from '@deepseek-ai/schemastery'

/** 时长字面量：正整数加单位（ms/s/m/h/d），如 `30s`、`7d`。 */
export const DURATION_PATTERN = /^[1-9]\d*(?:ms|s|m|h|d)$/u

/** 时区名的词法约束；是否存在由业务校验用 `Intl` 确认。 */
export const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-/]*$/u

/** 五段或六段 cron 表达式（DOC-14 §4.3）。 */
export const CRON_PATTERN = /^\S+(?:\s+\S+){4,5}$/u

/** 数据源类型（DOC-14 §4.3）。 */
export const COLLECTION_TYPES = ['mysql', 'ssh', 'log'] as const

/** 数据源类型。 */
export type CollectionType = (typeof COLLECTION_TYPES)[number]

/** 敏感数据类别（DOC-06 `SensitiveCategory`）。 */
export const SENSITIVE_CATEGORIES = ['CREDENTIAL', 'KEY', 'PII'] as const

/** 敏感数据类别。 */
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number]

/** 脱敏动作（DOC-06 `MaskingAction`）。 */
export const MASKING_ACTIONS = ['DELETE', 'HASH', 'MASK'] as const

/** 脱敏动作。 */
export type MaskingAction = (typeof MASKING_ACTIONS)[number]

/** 日志级别（DOC-14 §4.1）。 */
export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const

/** 日志级别。 */
export type LogLevel = (typeof LOG_LEVELS)[number]

/** 日志读取起点（DOC-14 §4.6）。 */
export const TAIL_FROM_VALUES = ['begin', 'end'] as const

/** 日志读取起点。 */
export type TailFrom = (typeof TAIL_FROM_VALUES)[number]

/** 强制采样事件名（DOC-14 §4.13）。 */
export const FORCED_SAMPLE_EVENTS = ['error', 'alert', 'recovery', 'config', 'authorization'] as const

function literal<T extends string>(values: readonly [T, ...T[]]) {
  return z.union(values.map(value => z.const(value)))
}

function duration() {
  return z.string().pattern(DURATION_PATTERN)
}

/** `SecretReference`（DOC-06）：只引用，不落明文。 */
function secretReference() {
  return z.object({
    secretRef: z.string().min(1).required(),
    provider: z.string().min(1).required(),
  }).required()
}

/** 脱敏策略（DOC-06 `MaskingPolicy`）。 */
function maskingPolicy() {
  return z.object({
    category: literal(SENSITIVE_CATEGORIES).required(),
    action: literal(MASKING_ACTIONS).required(),
    config: z.string(),
  }).required()
}

/** 调度：`cron` 与 `every` 二选一，互斥由业务校验确认（DOC-14 §5.2）。 */
function schedule() {
  return z.object({
    cron: z.string().pattern(CRON_PATTERN),
    every: duration(),
  }).required()
}

function mysqlCollection() {
  return z.object({
    host: z.string().min(1).required(),
    port: z.number().min(1).max(65535).required(),
    database: z.string().min(1).required(),
    tableWhitelist: z.array(z.string().min(1)).min(1).required(),
    columnWhitelist: z.dict(z.array(z.string().min(1)).min(1)).required(),
    accountRef: secretReference(),
    queryTimeoutMs: z.number().min(1).default(20_000),
    resultLimit: z.number().min(1).default(10_000),
    parameterize: z.boolean().default(true),
  })
}

function sshCollection() {
  return z.object({
    host: z.string().min(1).required(),
    port: z.number().min(1).max(65535).required(),
    user: z.string().min(1).required(),
    knownHosts: z.array(z.string().min(1)).min(1).required(),
    keyRef: secretReference(),
    commandTemplateWhitelist: z.array(z.string().min(1)).min(1).required(),
    paramWhitelist: z.dict(z.array(z.string().min(1)).min(1)).required(),
    execTimeoutMs: z.number().min(1).default(15_000),
    outputLimitBytes: z.number().min(1).default(1_048_576),
  })
}

function logCollection() {
  return z.object({
    path: z.string().min(1).required(),
    // A-2：`ParseRule` 结构未在 DOC-06/DOC-14 定义，暂以 `{ name, pattern }` 占位。
    parseRules: z.array(z.object({
      name: z.string().min(1).required(),
      pattern: z.string().min(1).required(),
    }).required()).min(1).required(),
    multilinePattern: z.string().min(1),
    encoding: z.string().min(1).default('utf-8'),
    tailFrom: literal(TAIL_FROM_VALUES).default('end'),
  })
}

/**
 * 清除对象 Schema 的隐式空对象默认值。
 * schemastery 的 `object` 会自动设置 `meta.default = {}`，使未声明的可选分支
 * 被当作空对象解析并触发其必填字段错误；清除后缺失的分支保持 undefined，
 * 由业务校验判定分支数量（DOC-14 §4.3）。
 * @param schema - 采集分支 Schema。
 * @returns 同一 Schema，缺失时不再注入 `{}`。
 */
function optionalBranch<T extends { meta: { default?: unknown } }>(schema: T): T {
  schema.meta.default = undefined
  return schema
}

/** 按 `type` 分派的采集参数；恰一个分支由业务校验确认（DOC-14 §4.3）。 */
function collectionConfig() {
  return z.object({
    mysql: optionalBranch(mysqlCollection()),
    ssh: optionalBranch(sshCollection()),
    log: optionalBranch(logCollection()),
  }).required()
}

function dataSource() {
  return z.object({
    dataSourceId: z.string().min(1).required(),
    tenantId: z.string().min(1).required(),
    type: literal(COLLECTION_TYPES).required(),
    enabled: z.boolean().default(true),
    schedule: schedule(),
    cursor: z.string().min(1).required(),
    connection: secretReference(),
    collectionConfig: collectionConfig(),
  }).required()
}

function tenant() {
  return z.object({
    tenantId: z.string().min(1).required(),
    enabled: z.boolean().default(true),
    timezone: z.string().pattern(TIMEZONE_PATTERN),
  }).required()
}

function global() {
  return z.object({
    timezone: z.string().pattern(TIMEZONE_PATTERN).default('Asia/Shanghai'),
    logLevel: literal(LOG_LEVELS).default('INFO'),
    retry: z.object({
      maxRetries: z.number().min(0).default(3),
      backoffBaseMs: z.number().min(1).default(200),
      backoffMaxMs: z.number().min(1).default(5_000),
    }).default({}),
    timeout: z.object({
      collectionMs: z.number().min(1).default(30_000),
      ruleEvalMs: z.number().min(1).default(10_000),
      notificationMs: z.number().min(1).default(15_000),
    }).default({}),
    reconciliation: z.object({
      interval: duration().default('1h'),
    }).default({}),
    proposal: z.object({
      expiryTimeout: duration().default('72h'),
    }).default({}),
  }).default({})
}

function concurrencyBudget() {
  return z.object({
    globalTask: z.number().min(1).default(8),
    workflow: z.number().min(1).default(4),
    workflowNode: z.number().min(1).default(3),
    collection: z.number().min(1).default(3),
    metric: z.number().min(1).default(2),
    rule: z.number().min(1).default(2),
    notification: z.number().min(1).default(2),
    report: z.number().min(1).default(1),
    perTenantTask: z.number().min(1).default(3),
    perDataSourceCollection: z.number().min(1).default(2),
    // TBD-002：队列积压阈值待压测，暂不提供默认值，由部署方显式给出。
    queueBacklog: z.number().min(1),
  }).required()
}

function retention() {
  return z.object({
    journal: duration().default('7d'),
    log: duration().default('30d'),
    metric: duration().default('90d'),
    report: duration().default('90d'),
    backup: duration().default('90d'),
  }).default({})
}

function observability() {
  return z.object({
    traceSamplingRate: z.number().min(0).max(1).default(1),
    logSamplingRate: z.number().min(0).max(1).default(1),
    forcedSampleEvents: z.array(literal(FORCED_SAMPLE_EVENTS)).default([...FORCED_SAMPLE_EVENTS]),
    alertThresholds: z.dict(z.number()).default({}),
    alertCooldown: duration().default('5m'),
    // TBD-001：指标上报目标待基线样本量确定，缺失时由调用方按 fixture 回填。
    metricReportTarget: z.string().min(1),
  }).default({})
}

function security() {
  return z.object({
    // 「默认严格」在脱敏执行阶段生效；空表表示不为任何实体放宽策略。
    maskingProfiles: z.dict(z.array(maskingPolicy()).min(1)).default({}),
    audit: z.object({
      enabled: z.boolean().default(true),
    }).default({}),
    secretProvider: z.string().min(1),
  }).default({})
}

/** 顶层配置 Schema（DOC-14 §3）。 */
export const configSchema = z.object({
  global: global(),
  tenants: z.array(tenant()).default([]),
  dataSources: z.array(dataSource()).default([]),
  concurrencyBudget: concurrencyBudget(),
  retention: retention(),
  observability: observability(),
  security: security(),
}).required()

/** 归一化后的完整配置（默认值已注入）。 */
export type ResolvedConfig = ReturnType<typeof configSchema>
