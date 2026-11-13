/**
 * 配置校验、不可变快照与热更新回退的行为测试（DOC-14 §3~§7）。
 * 覆盖正常路径、边界值、错误分类与字段路径定位。
 */

import { describe, expect, it } from 'vitest'
import {
  ConfigService,
  createConfigSnapshot,
  hashConfig,
  validateConfig,
} from '../src/application/config/index.ts'
import type {
  ConfigAuditEvent,
  ConfigAuditPort,
  ResolvedConfig,
} from '../src/application/config/index.ts'
import { Config } from '../src/index.ts'
import { InternalError, ValidationError, toAuditRecordId } from '../src/shared/index.ts'
import {
  logDataSource,
  minimalConfig,
  mysqlBranch,
  mysqlDataSource,
  sshBranch,
  sshDataSource,
  TBD_001_ALERT_THRESHOLDS,
  TBD_002_QUEUE_BACKLOG,
} from './config-fixture.ts'

/**
 * 解析配置，失败时抛出，供只关心成功结果的用例使用。
 * @param raw - 原始配置。
 * @returns 归一化配置。
 */
function resolved(raw: Record<string, unknown> = minimalConfig()): ResolvedConfig {
  const result = validateConfig(raw)
  if (!result.ok) throw result.error
  return result.value
}

/**
 * 断言配置被拒绝并返回错误。
 * @param raw - 原始配置。
 * @returns 校验错误。
 */
function expectInvalid(raw: unknown): ValidationError {
  const result = validateConfig(raw)
  if (result.ok) throw new Error('预期配置被拒绝，但校验通过。')
  return result.error
}

/** 记录型审计端口，用于断言审计留痕。 */
interface RecordingAudit extends ConfigAuditPort {
  readonly events: readonly ConfigAuditEvent[]
}

/**
 * 创建内存审计端口。
 * @returns 可读取事件的审计端口。
 */
function createRecordingAudit(): RecordingAudit {
  const events: ConfigAuditEvent[] = []
  return {
    events,
    record(event: ConfigAuditEvent) {
      events.push(event)
      return toAuditRecordId(`audit:${events.length}`)
    },
  }
}

describe('配置 Schema 校验（DOC-14 §3~§5）', () => {
  it('[ID_PENDING] 最小配置通过校验并注入默认值，TBD 占位值保留', () => {
    const value = resolved()

    expect(value.global.timezone).toBe('Asia/Shanghai')
    expect(value.global.retry.maxRetries).toBe(3)
    expect(value.global.timeout.collectionMs).toBe(30_000)
    expect(value.global.reconciliation.interval).toBe('1h')
    expect(value.global.proposal.expiryTimeout).toBe('72h')
    expect(value.concurrencyBudget.globalTask).toBe(8)
    expect(value.concurrencyBudget.queueBacklog).toBe(TBD_002_QUEUE_BACKLOG)
    expect(value.observability.traceSamplingRate).toBe(1)
    expect(value.observability.forcedSampleEvents).toEqual([
      'error',
      'alert',
      'recovery',
      'config',
      'authorization',
    ])
    expect(value.observability.alertThresholds).toEqual(TBD_001_ALERT_THRESHOLDS)
    expect(value.retention.journal).toBe('7d')
    expect(value.security.audit.enabled).toBe(true)
    expect(value.tenants).toEqual([])
    expect(value.dataSources).toEqual([])
  })

  it('[ID_PENDING] 三类数据源分支均可通过校验', () => {
    const value = resolved(minimalConfig({
      tenants: [{ tenantId: 'tenant-a' }],
      dataSources: [mysqlDataSource(), sshDataSource(), logDataSource()],
    }))

    expect(value.dataSources.map(source => source.type)).toEqual(['mysql', 'ssh', 'log'])
    expect(value.dataSources[0]?.collectionConfig.mysql?.parameterize).toBe(true)
    expect(value.dataSources[1]?.collectionConfig.ssh?.execTimeoutMs).toBe(15_000)
    expect(value.dataSources[2]?.collectionConfig.log?.tailFrom).toBe('end')
  })

  it('[ID_PENDING] 未知顶层字段 fail-loud 并给字段路径', () => {
    const error = expectInvalid(minimalConfig({ unexpected: true }))

    expect(error).toBeInstanceOf(ValidationError)
    expect(error.code).toBe('configUnknownField')
    expect(error.fieldPath).toBe('$.unexpected')
    expect(error.category).toBe('Validation')
    expect(error.retryable).toBe(false)
  })

  it('[ID_PENDING] 未知嵌套字段与数组元素字段 fail-loud', () => {
    expect(expectInvalid(minimalConfig({
      global: { timezone: 'UTC', unexpected: 1 },
    })).fieldPath).toBe('$.global.unexpected')

    expect(expectInvalid(minimalConfig({
      tenants: [{ tenantId: 'tenant-a', unexpected: 1 }],
    })).fieldPath).toBe('$.tenants[0].unexpected')
  })

  it('[ID_PENDING] 字典值内的未知字段 fail-loud', () => {
    const error = expectInvalid(minimalConfig({
      security: {
        maskingProfiles: {
          user: [{ category: 'PII', action: 'HASH', unexpected: 1 }],
        },
      },
    }))

    expect(error.code).toBe('configUnknownField')
    expect(error.fieldPath).toBe('$.security.maskingProfiles.user[0].unexpected')
  })

  it('[ID_PENDING] 显式 null 一律拒绝，含数组元素', () => {
    expect(expectInvalid(minimalConfig({
      global: { timezone: null },
    }))).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$.global.timezone' })

    expect(expectInvalid(minimalConfig({
      tenants: [null],
    }))).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$.tenants[0]' })
  })

  it('[ID_PENDING] 非对象配置在根路径报错', () => {
    for (const raw of [null, [], 'config', new Date()]) {
      expect(expectInvalid(raw)).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$' })
    }
  })

  it('[ID_PENDING] 类型错误与越界值 fail-loud', () => {
    expect(expectInvalid(minimalConfig({
      concurrencyBudget: { queueBacklog: TBD_002_QUEUE_BACKLOG, globalTask: 0 },
    }))).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$.concurrencyBudget.globalTask' })

    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource({ collectionConfig: { mysql: mysqlBranch({ port: 65_536 }) } })],
    }))).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$.dataSources[0].collectionConfig.mysql.port' })

    expect(expectInvalid(minimalConfig({
      observability: { traceSamplingRate: 2 },
    }))).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$.observability.traceSamplingRate' })

    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource({ type: 'postgres' })],
    }))).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$.dataSources[0].type' })

    expect(expectInvalid(minimalConfig({
      tenants: 'tenant-a',
    }))).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$.tenants' })

    expect(expectInvalid(minimalConfig({
      dataSources: { 'ds-mysql': mysqlDataSource() },
    }))).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$.dataSources' })

    expect(expectInvalid(minimalConfig({
      global: { timezone: { name: 'UTC' } },
    }))).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$.global.timezone' })
  })

  it('[ID_PENDING] 缺失必填字段 fail-loud', () => {
    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource({ cursor: undefined })],
    }))).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$.dataSources[0].cursor' })

    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource({ connection: undefined })],
    }))).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$.dataSources[0].connection' })

    expect(expectInvalid(minimalConfig({
      dataSources: [sshDataSource({ collectionConfig: { ssh: sshBranch({ knownHosts: [] }) } })],
    }))).toMatchObject({
      code: 'configSchemaInvalid',
      fieldPath: '$.dataSources[0].collectionConfig.ssh.knownHosts',
    })

    expect(expectInvalid({})).toMatchObject({ code: 'configSchemaInvalid', fieldPath: '$.concurrencyBudget' })
  })

  it('[ID_PENDING] 非法时区在全局与租户两级都 fail-loud', () => {
    expect(expectInvalid(minimalConfig({
      global: { timezone: 'Mars/Olympus' },
    }))).toMatchObject({ code: 'configInvalidTimezone', fieldPath: '$.global.timezone' })

    expect(expectInvalid(minimalConfig({
      tenants: [{ tenantId: 'tenant-a', timezone: 'Mars/Olympus' }],
    }))).toMatchObject({ code: 'configInvalidTimezone', fieldPath: '$.tenants[0].timezone' })
  })

  it('[ID_PENDING] 退避上限小于基数 fail-loud', () => {
    const error = expectInvalid(minimalConfig({
      global: { retry: { backoffBaseMs: 1_000, backoffMaxMs: 100 } },
    }))

    expect(error).toMatchObject({
      code: 'configRetryBackoffInvalid',
      fieldPath: '$.global.retry.backoffMaxMs',
    })
  })

  it('[ID_PENDING] 并发预算越界 fail-loud', () => {
    expect(expectInvalid(minimalConfig({
      concurrencyBudget: {
        queueBacklog: TBD_002_QUEUE_BACKLOG,
        globalTask: 2,
        perTenantTask: 3,
      },
    }))).toMatchObject({
      code: 'configConcurrencyBudgetInvalid',
      fieldPath: '$.concurrencyBudget.perTenantTask',
    })

    expect(expectInvalid(minimalConfig({
      concurrencyBudget: {
        queueBacklog: TBD_002_QUEUE_BACKLOG,
        collection: 1,
        perDataSourceCollection: 2,
      },
    }))).toMatchObject({
      code: 'configConcurrencyBudgetInvalid',
      fieldPath: '$.concurrencyBudget.perDataSourceCollection',
    })
  })

  it('[ID_PENDING] 关闭配置审计 fail-closed', () => {
    expect(expectInvalid(minimalConfig({
      security: { audit: { enabled: false } },
    }))).toMatchObject({ code: 'configAuditDisabled', fieldPath: '$.security.audit.enabled' })
  })

  it('[ID_PENDING] 重复租户与重复数据源标识 fail-loud', () => {
    expect(expectInvalid(minimalConfig({
      tenants: [{ tenantId: 'tenant-a' }, { tenantId: 'tenant-a' }],
    }))).toMatchObject({ code: 'configDuplicateTenant', fieldPath: '$.tenants' })

    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource(), mysqlDataSource()],
    }))).toMatchObject({ code: 'configDuplicateDataSource', fieldPath: '$.dataSources' })
  })

  it('[ID_PENDING] 数据源引用未配置的租户 fail-loud', () => {
    const error = expectInvalid(minimalConfig({
      tenants: [{ tenantId: 'tenant-a' }],
      dataSources: [mysqlDataSource({ tenantId: 'tenant-b' })],
    }))

    expect(error).toMatchObject({
      code: 'configUnknownTenantReference',
      fieldPath: '$.dataSources[0].tenantId',
    })
  })

  it('[ID_PENDING] schedule 必须在 cron 与 every 之间二选一', () => {
    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource({ schedule: { cron: '0 */5 * * * *', every: '5m' } })],
    }))).toMatchObject({ code: 'configScheduleInvalid', fieldPath: '$.dataSources[0].schedule' })

    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource({ schedule: {} })],
    }))).toMatchObject({ code: 'configScheduleInvalid', fieldPath: '$.dataSources[0].schedule' })

    expect(resolved(minimalConfig({
      dataSources: [mysqlDataSource({ schedule: { every: '5m' } })],
    })).dataSources[0]?.schedule.every).toBe('5m')
  })

  it('[ID_PENDING] collectionConfig 必须且只能声明一个采集分支', () => {
    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource({ collectionConfig: {} })],
    }))).toMatchObject({
      code: 'configCollectionBranchInvalid',
      fieldPath: '$.dataSources[0].collectionConfig',
    })

    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource({
        collectionConfig: { mysql: mysqlBranch(), ssh: sshBranch() },
      })],
    }))).toMatchObject({
      code: 'configCollectionBranchInvalid',
      fieldPath: '$.dataSources[0].collectionConfig',
    })
  })

  it('[ID_PENDING] 采集分支与数据源 type 不一致 fail-loud', () => {
    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource({ type: 'ssh' })],
    }))).toMatchObject({ code: 'configCollectionTypeMismatch', fieldPath: '$.dataSources[0].type' })

    expect(expectInvalid(minimalConfig({
      dataSources: [sshDataSource({ type: 'mysql' })],
    }))).toMatchObject({ code: 'configCollectionTypeMismatch', fieldPath: '$.dataSources[0].type' })

    expect(expectInvalid(minimalConfig({
      dataSources: [logDataSource({ type: 'mysql' })],
    }))).toMatchObject({ code: 'configCollectionTypeMismatch', fieldPath: '$.dataSources[0].type' })
  })

  it('[ID_PENDING] MySQL 列白名单为空或引用未授权表 fail-loud', () => {
    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource({
        collectionConfig: { mysql: mysqlBranch({ columnWhitelist: {} }) },
      })],
    }))).toMatchObject({
      code: 'configColumnWhitelistEmpty',
      fieldPath: '$.dataSources[0].collectionConfig.mysql.columnWhitelist',
    })

    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource({
        collectionConfig: { mysql: mysqlBranch({ columnWhitelist: { other_table: ['id'] } }) },
      })],
    }))).toMatchObject({
      code: 'configUnknownTableReference',
      fieldPath: '$.dataSources[0].collectionConfig.mysql.columnWhitelist',
    })
  })

  it('[ID_PENDING] MySQL 关闭参数化 fail-loud', () => {
    expect(expectInvalid(minimalConfig({
      dataSources: [mysqlDataSource({
        collectionConfig: { mysql: mysqlBranch({ parameterize: false }) },
      })],
    }))).toMatchObject({
      code: 'configParameterizationDisabled',
      fieldPath: '$.dataSources[0].collectionConfig.mysql.parameterize',
    })
  })

  it('[ID_PENDING] SSH 参数白名单引用未授权命令模板 fail-loud', () => {
    expect(expectInvalid(minimalConfig({
      dataSources: [sshDataSource({
        collectionConfig: { ssh: sshBranch({ paramWhitelist: { reboot: ['host'] } }) },
      })],
    }))).toMatchObject({
      code: 'configUnknownCommandReference',
      fieldPath: '$.dataSources[0].collectionConfig.ssh.paramWhitelist',
    })
  })

  it('[ID_PENDING] 脱敏动作与敏感类别不匹配时 fail-loud，匹配时通过', () => {
    expect(expectInvalid(minimalConfig({
      security: {
        maskingProfiles: { credential: [{ category: 'CREDENTIAL', action: 'MASK' }] },
      },
    }))).toMatchObject({
      code: 'configMaskingPolicyInvalid',
      fieldPath: '$.security.maskingProfiles.credential[0].action',
    })

    const value = resolved(minimalConfig({
      security: {
        maskingProfiles: {
          credential: [{ category: 'CREDENTIAL', action: 'DELETE' }],
          key: [{ category: 'KEY', action: 'DELETE' }],
          pii: [{ category: 'PII', action: 'HASH' }, { category: 'PII', action: 'MASK' }],
        },
      },
    }))

    expect(value.security.maskingProfiles.pii).toHaveLength(2)
  })
})

describe('配置快照（DOC-14 §6.1）', () => {
  it('[ID_PENDING] 快照携带版本、内容哈希与快照引用且被深冻结', () => {
    const value = resolved(minimalConfig({ dataSources: [mysqlDataSource()] }))
    const snapshot = createConfigSnapshot(value, 3, 42)

    expect(snapshot.version).toBe(3)
    expect(snapshot.createdAt).toBe(42)
    expect(snapshot.contentHash).toBe(hashConfig(value))
    expect(snapshot.ref).toBe(`config:v3:${snapshot.contentHash.slice(0, 12)}`)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.value)).toBe(true)
    expect(Object.isFrozen(snapshot.value.global)).toBe(true)
    expect(Object.isFrozen(snapshot.value.dataSources)).toBe(true)
    expect(Object.isFrozen(snapshot.value.dataSources[0])).toBe(true)
  })

  it('[ID_PENDING] 内容哈希对同一内容稳定、对不同内容变化', () => {
    expect(hashConfig(resolved())).toBe(hashConfig(resolved()))
    expect(hashConfig(resolved())).not.toBe(hashConfig(resolved(minimalConfig({
      global: { timezone: 'UTC' },
    }))))
  })
})

describe('配置装载与热更新（DOC-14 §7）', () => {
  it('[ID_PENDING] 未装载时读取当前快照抛 InternalError', () => {
    const service = new ConfigService(createRecordingAudit(), () => 0)

    expect(() => service.current()).toThrow(InternalError)
    expect(() => service.current()).toThrow('配置尚未装载。')
    expect(service.lastFailure()).toBeUndefined()
  })

  it('[ID_PENDING] 首次装载成功并写入 SUCCESS 审计', () => {
    const audit = createRecordingAudit()
    const service = new ConfigService(audit, () => 1_000)

    const snapshot = service.load(minimalConfig())

    expect(snapshot.version).toBe(1)
    expect(service.current()).toBe(snapshot)
    expect(audit.events).toHaveLength(1)
    expect(audit.events[0]).toMatchObject({
      action: 'config.load',
      result: 'SUCCESS',
      version: 1,
      at: 1_000,
      contentHash: snapshot.contentHash,
      errorCode: undefined,
      tenantId: undefined,
    })
  })

  it('[ID_PENDING] 首次装载失败无 LKG 可回退，失败原因可查', () => {
    const audit = createRecordingAudit()
    const service = new ConfigService(audit, () => 2_000)

    expect(() => service.load({})).toThrow(ValidationError)
    expect(() => service.current()).toThrow(InternalError)
    expect(service.lastFailure()).toMatchObject({
      at: 2_000,
      action: 'config.load',
      code: 'configSchemaInvalid',
      fieldPath: '$.concurrencyBudget',
    })
    expect(audit.events).toHaveLength(1)
    expect(audit.events[0]).toMatchObject({
      action: 'config.load',
      result: 'FAILED',
      version: 1,
      contentHash: undefined,
    })
  })

  it('[ID_PENDING] 热更新版本单调递增且不改写历史快照', () => {
    const service = new ConfigService(createRecordingAudit(), () => 3_000)
    const first = service.load(minimalConfig())
    const firstHash = first.contentHash
    const firstRef = first.ref

    const second = service.reload(minimalConfig({ global: { timezone: 'UTC' } }))

    expect(second.version).toBe(2)
    expect(service.current()).toBe(second)
    expect(first.version).toBe(1)
    expect(first.contentHash).toBe(firstHash)
    expect(first.ref).toBe(firstRef)
    expect(first.value.global.timezone).toBe('Asia/Shanghai')
    expect(second.value.global.timezone).toBe('UTC')
  })

  it('[ID_PENDING] 热更新失败保留 LKG 并记录失败与回退审计', () => {
    const audit = createRecordingAudit()
    const service = new ConfigService(audit, () => 4_000)
    const lkg = service.load(minimalConfig())

    expect(() => service.reload({})).toThrow(ValidationError)

    expect(service.current()).toBe(lkg)
    expect(service.lastFailure()).toMatchObject({
      at: 4_000,
      action: 'config.reload',
      code: 'configSchemaInvalid',
      fieldPath: '$.concurrencyBudget',
    })
    expect(audit.events.map(event => [event.action, event.result])).toEqual([
      ['config.load', 'SUCCESS'],
      ['config.reload', 'FAILED'],
      ['config.rollback', 'SUCCESS'],
    ])
    expect(audit.events[2]).toMatchObject({
      version: lkg.version,
      contentHash: lkg.contentHash,
      errorCode: 'configSchemaInvalid',
    })
  })

  it('[ID_PENDING] 后续成功装载清除最近失败原因', () => {
    const service = new ConfigService(createRecordingAudit(), () => 5_000)
    service.load(minimalConfig())
    expect(() => service.reload({})).toThrow(ValidationError)

    const recovered = service.reload(minimalConfig())

    expect(recovered.version).toBe(3)
    expect(service.lastFailure()).toBeUndefined()
  })
})

describe('Loader 配置校验器（Cordis StandardSchema）', () => {
  it('[ID_PENDING] 合法配置返回注入默认值后的配置', () => {
    const result = Config['~standard'].validate(minimalConfig())

    expect('value' in result).toBe(true)
    if (!('value' in result)) throw new Error('预期校验通过。')
    expect(result.value.global.timezone).toBe('Asia/Shanghai')
  })

  it('[ID_PENDING] 非法配置返回带错误码与字段路径的 issue', () => {
    const result = Config['~standard'].validate({ unexpected: true })

    expect('issues' in result).toBe(true)
    if (!('issues' in result)) throw new Error('预期校验失败。')
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.message).toContain('configUnknownField')
    expect(result.issues[0]?.path).toEqual(['$.unexpected'])
  })
})
