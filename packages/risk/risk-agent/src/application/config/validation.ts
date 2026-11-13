/**
 * 配置校验（DOC-14 §5）：Schema 结构校验之外，显式拒绝 null 与未知字段，
 * 并执行跨字段业务校验与引用完整性校验。所有失败都返回带字段路径的
 * `ValidationError`，由装载方 fail-loud。
 * @module
 */

import { ValidationError } from '../../shared/index.ts'
import { configSchema } from './schema.ts'
import type { ResolvedConfig, SensitiveCategory } from './schema.ts'

/** 校验结果的判别联合。 */
export type ConfigValidation =
  | { readonly ok: true; readonly value: ResolvedConfig }
  | { readonly ok: false; readonly error: ValidationError }

/** 每个敏感类别允许的脱敏动作（DOC-06 §6.11）。 */
const ALLOWED_MASKING_ACTIONS: Record<SensitiveCategory, readonly string[]> = {
  CREDENTIAL: ['DELETE'],
  KEY: ['DELETE'],
  PII: ['HASH', 'MASK'],
}

/*
 * Schema 的输出类型把所有声明键都标为必填，但「未声明且无默认值」的字段
 * 在解析结果中并不存在。下列运行时视图只用于这些字段的缺失判定。
 */

/** `schedule` 的运行时视图：`cron` 与 `every` 二选一。 */
type DeclaredSchedule = { readonly cron?: string; readonly every?: string }

/** 租户的运行时视图：省略时区即继承全局时区。 */
type DeclaredTenant = { readonly timezone?: string }

/** 采集分支的运行时视图：恰有一个分支被声明。 */
type DeclaredCollectionConfig = {
  readonly mysql?: ResolvedConfig['dataSources'][number]['collectionConfig']['mysql']
  readonly ssh?: ResolvedConfig['dataSources'][number]['collectionConfig']['ssh']
  readonly log?: ResolvedConfig['dataSources'][number]['collectionConfig']['log']
}

/** Schema 节点中未知字段检测所需的最小视图。 */
interface SchemaNode {
  readonly type: string
  readonly dict?: Record<string, SchemaNode>
  readonly inner?: SchemaNode
}

/**
 * 找到第一个 null 字段路径。
 * schemastery 对「可选且无默认值」的字段会让显式 null 原样通过，
 * 因此必须在 Schema 解析前显式拒绝（配置来自 YAML，null 一律非法）。
 * @param value - 待检查的原始配置值。
 * @param path - 当前节点路径，根为 `$`。
 * @returns 第一个 null 的字段路径；没有 null 时返回 undefined。
 */
export function findNullPath(value: unknown, path = '$'): string | undefined {
  if (value === null) return path
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findNullPath(item, `${path}[${index}]`)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const found = findNullPath(item, `${path}.${key}`)
      if (found !== undefined) return found
    }
  }
  return undefined
}

/**
 * 查找 Schema 未声明的首个字段路径。
 * @param schema - 当前节点的 Schema 视图。
 * @param data - 当前节点的原始数据。
 * @param path - 当前节点路径。
 * @returns 未知字段路径；不存在时返回 undefined。
 */
function collectUnknownKeys(schema: SchemaNode, data: unknown, path: string): string | undefined {
  if (data === null || typeof data !== 'object') return undefined
  switch (schema.type) {
    case 'object': {
      // `z.object` 必定携带 dict；断言只去掉可选性，不改变运行时结构。
      const dict = schema.dict as Record<string, SchemaNode>
      for (const [key, item] of Object.entries(data)) {
        const child = dict[key]
        if (child === undefined) return `${path}.${key}`
        const nested = collectUnknownKeys(child, item, `${path}.${key}`)
        if (nested !== undefined) return nested
      }
      return undefined
    }
    case 'array': {
      if (!Array.isArray(data)) return undefined
      // `z.array` 必定携带 inner；断言只去掉可选性。
      const inner = schema.inner as SchemaNode
      for (const [index, item] of data.entries()) {
        const nested = collectUnknownKeys(inner, item, `${path}[${index}]`)
        if (nested !== undefined) return nested
      }
      return undefined
    }
    case 'dict': {
      // `z.dict` 必定携带 inner；断言只去掉可选性。
      const inner = schema.inner as SchemaNode
      for (const [key, item] of Object.entries(data)) {
        const nested = collectUnknownKeys(inner, item, `${path}.${key}`)
        if (nested !== undefined) return nested
      }
      return undefined
    }
    default:
      return undefined
  }
}

/**
 * 判断字符串是否是运行时认识的 IANA 时区。
 * @param value - 待校验的时区名。
 * @returns 是否为合法 IANA 时区。
 */
function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
  } catch {
    // 未知时区时 `Intl` 抛 RangeError；异常即视为非法时区。
    return false
  }
  return true
}

/**
 * 从 schemastery 的校验消息中提取字段路径。
 * @param message - 去掉错误名前缀的消息。
 * @returns 形如 `$.a.b` 的字段路径；根级错误返回 `$`。
 */
function fieldPathOf(message: string): string {
  const match = /^\$[^\s]*/u.exec(message)
  /* v8 ignore next -- 根节点错误不带路径前缀，而根节点已由 `isConfigRecord` 拦截。 */
  if (match === null) return '$'
  return match[0]
}

function invalid(code: string, message: string, fieldPath: string): ValidationError {
  return new ValidationError(code, message, fieldPath)
}

function findDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) return value
    seen.add(value)
  }
  return undefined
}

/**
 * 判断值是否是配置可用的普通对象。
 * 数组、`Date` 等非记录对象在根层一律按「配置必须是对象」拒绝，
 * 避免 Schema 把它们当作空对象并报出误导性的嵌套字段错误。
 * @param value - 待判断的值。
 * @returns 是否为普通记录对象。
 */
function isConfigRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.getPrototypeOf(value) === Object.prototype
}

/**
 * 执行 Schema 与业务校验。
 * @param raw - 来自 YAML/配置中心的原始值。
 * @returns 归一化配置或带字段路径的校验错误。
 */
export function validateConfig(raw: unknown): ConfigValidation {
  if (!isConfigRecord(raw)) {
    return { ok: false, error: invalid('configSchemaInvalid', '配置必须是对象。', '$') }
  }
  const nullPath = findNullPath(raw)
  if (nullPath !== undefined) {
    return { ok: false, error: invalid('configSchemaInvalid', `配置字段不得为 null：${nullPath}`, nullPath) }
  }
  const unknownField = collectUnknownKeys(configSchema, raw, '$')
  if (unknownField !== undefined) {
    return { ok: false, error: invalid('configUnknownField', `未知配置字段：${unknownField}`, unknownField) }
  }
  let value: ResolvedConfig
  try {
    value = configSchema(raw)
  } catch (error) {
    const message = String(error).replace(/^[A-Za-z]*Error: /u, '')
    return {
      ok: false,
      error: invalid('configSchemaInvalid', `配置未通过 Schema 校验：${message}`, fieldPathOf(message)),
    }
  }
  const violation = checkInvariants(value)
  if (violation !== undefined) return { ok: false, error: violation }
  return { ok: true, value }
}

/**
 * 跨字段业务校验与引用完整性校验（DOC-14 §5.2/§5.3）。
 * @param value - 已注入默认值的配置。
 * @returns 第一处违规；全部通过时返回 undefined。
 */
function checkInvariants(value: ResolvedConfig): ValidationError | undefined {
  if (!isValidTimezone(value.global.timezone)) {
    return invalid('configInvalidTimezone', `非法时区：${value.global.timezone}`, '$.global.timezone')
  }
  const { retry } = value.global
  if (retry.backoffMaxMs < retry.backoffBaseMs) {
    return invalid('configRetryBackoffInvalid', '退避上限不得小于退避基数。', '$.global.retry.backoffMaxMs')
  }
  const budget = value.concurrencyBudget
  if (budget.perTenantTask > budget.globalTask) {
    return invalid('configConcurrencyBudgetInvalid', 'perTenantTask 不得超过 globalTask。', '$.concurrencyBudget.perTenantTask')
  }
  if (budget.perDataSourceCollection > budget.collection) {
    return invalid(
      'configConcurrencyBudgetInvalid',
      'perDataSourceCollection 不得超过 collection。',
      '$.concurrencyBudget.perDataSourceCollection',
    )
  }
  if (!value.security.audit.enabled) {
    return invalid('configAuditDisabled', '配置审计必须保持启用（fail-closed）。', '$.security.audit.enabled')
  }
  const duplicateTenant = findDuplicate(value.tenants.map(tenant => tenant.tenantId))
  if (duplicateTenant !== undefined) {
    return invalid('configDuplicateTenant', `租户标识重复：${duplicateTenant}`, '$.tenants')
  }
  for (const [index, tenant] of value.tenants.entries()) {
    const declared = tenant as DeclaredTenant
    if (declared.timezone !== undefined && !isValidTimezone(declared.timezone)) {
      return invalid('configInvalidTimezone', `非法时区：${declared.timezone}`, `$.tenants[${index}].timezone`)
    }
  }
  const duplicateSource = findDuplicate(value.dataSources.map(source => source.dataSourceId))
  if (duplicateSource !== undefined) {
    return invalid('configDuplicateDataSource', `数据源标识重复：${duplicateSource}`, '$.dataSources')
  }
  const tenantIds = new Set(value.tenants.map(tenant => tenant.tenantId))
  for (const [index, source] of value.dataSources.entries()) {
    const path = `$.dataSources[${index}]`
    if (value.tenants.length > 0 && !tenantIds.has(source.tenantId)) {
      return invalid('configUnknownTenantReference', `数据源引用了未配置的租户：${source.tenantId}`, `${path}.tenantId`)
    }
    const schedule = source.schedule as DeclaredSchedule
    if ((schedule.cron !== undefined) === (schedule.every !== undefined)) {
      return invalid('configScheduleInvalid', 'schedule 必须在 cron 与 every 之间二选一。', `${path}.schedule`)
    }
    const violation = checkCollection(source, path)
    if (violation !== undefined) return violation
  }
  return checkMaskingProfiles(value)
}

/**
 * 校验单个数据源的采集参数分支。
 * @param source - 数据源配置。
 * @param path - 数据源字段路径。
 * @returns 第一处违规；通过时返回 undefined。
 */
function checkCollection(
  source: ResolvedConfig['dataSources'][number],
  path: string,
): ValidationError | undefined {
  const { mysql, ssh, log } = source.collectionConfig as DeclaredCollectionConfig
  const present = [mysql !== undefined, ssh !== undefined, log !== undefined].filter(Boolean).length
  if (present !== 1) {
    return invalid('configCollectionBranchInvalid', 'collectionConfig 必须且只能声明一个采集分支。', `${path}.collectionConfig`)
  }
  if (mysql !== undefined) {
    if (source.type !== 'mysql') {
      return invalid('configCollectionTypeMismatch', 'collectionConfig 分支与数据源 type 不一致。', `${path}.type`)
    }
    if (Object.keys(mysql.columnWhitelist).length === 0) {
      return invalid('configColumnWhitelistEmpty', 'columnWhitelist 不得为空。', `${path}.collectionConfig.mysql.columnWhitelist`)
    }
    for (const table of Object.keys(mysql.columnWhitelist)) {
      if (!mysql.tableWhitelist.includes(table)) {
        return invalid(
          'configUnknownTableReference',
          `columnWhitelist 引用了未列入 tableWhitelist 的表：${table}`,
          `${path}.collectionConfig.mysql.columnWhitelist`,
        )
      }
    }
    if (!mysql.parameterize) {
      return invalid('configParameterizationDisabled', 'MySQL 采集必须启用参数化。', `${path}.collectionConfig.mysql.parameterize`)
    }
  }
  if (ssh !== undefined) {
    if (source.type !== 'ssh') {
      return invalid('configCollectionTypeMismatch', 'collectionConfig 分支与数据源 type 不一致。', `${path}.type`)
    }
    for (const template of Object.keys(ssh.paramWhitelist)) {
      if (!ssh.commandTemplateWhitelist.includes(template)) {
        return invalid(
          'configUnknownCommandReference',
          `paramWhitelist 引用了未列入白名单的命令模板：${template}`,
          `${path}.collectionConfig.ssh.paramWhitelist`,
        )
      }
    }
  }
  if (log !== undefined && source.type !== 'log') {
    return invalid('configCollectionTypeMismatch', 'collectionConfig 分支与数据源 type 不一致。', `${path}.type`)
  }
  return undefined
}

/**
 * 校验脱敏策略：CREDENTIAL/KEY 只允许 DELETE，PII 只允许 HASH/MASK（DOC-12 §6）。
 * @param value - 完整配置。
 * @returns 第一处违规；通过时返回 undefined。
 */
function checkMaskingProfiles(value: ResolvedConfig): ValidationError | undefined {
  for (const [entity, policies] of Object.entries(value.security.maskingProfiles)) {
    for (const [index, policy] of policies.entries()) {
      if (!ALLOWED_MASKING_ACTIONS[policy.category].includes(policy.action)) {
        return invalid(
          'configMaskingPolicyInvalid',
          `实体 ${entity} 的脱敏动作与敏感类别不匹配。`,
          `$.security.maskingProfiles.${entity}[${index}].action`,
        )
      }
    }
  }
  return undefined
}
