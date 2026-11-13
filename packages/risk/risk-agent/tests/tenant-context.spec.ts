/**
 * 可信租户上下文与跨租户拒绝的行为测试（DOC-12 §3）。
 * 覆盖可信身份缺失、伪造/跨租户、时区继承与热更新后的快照解析。
 */

import { describe, expect, it } from 'vitest'
import { createConfigSnapshot, validateConfig } from '../src/application/config/index.ts'
import type { ConfigSnapshot, ResolvedConfig } from '../src/application/config/index.ts'
import { assertTenantAccess, establishTenantContext } from '../src/application/security/index.ts'
import { createTenantContext } from '../src/domain/index.ts'
import { createRiskAgentRuntime, resolveConfiguredIdentity, SINGLE_TENANT_ID } from '../src/plugin/composition/index.ts'
import { AuthorizationError } from '../src/shared/index.ts'
import { minimalConfig } from './config-fixture.ts'

/**
 * 解析配置，失败时抛出。
 * @param raw - 原始配置。
 * @returns 归一化配置（未冻结）。
 */
function configOf(raw: Record<string, unknown> = minimalConfig()): ResolvedConfig {
  const result = validateConfig(raw)
  if (!result.ok) throw result.error
  return result.value
}

/**
 * 构造一份已校验、已冻结的配置快照。
 * @param raw - 原始配置。
 * @returns 版本为 1 的快照。
 */
function snapshotOf(raw: Record<string, unknown> = minimalConfig()): ConfigSnapshot {
  return createConfigSnapshot(configOf(raw), 1, 0)
}

/**
 * 断言调用抛出指定的授权错误。
 * @param invoke - 待执行的动作。
 * @param code - 期望的稳定错误码。
 * @returns 捕获到的授权错误。
 */
function expectAuthError(invoke: () => unknown, code: string): AuthorizationError {
  try {
    invoke()
  } catch (error) {
    if (error instanceof AuthorizationError) {
      expect(error.code).toBe(code)
      expect(error.category).toBe('Authorization')
      expect(error.retryable).toBe(false)
      return error
    }
    throw error
  }
  throw new Error('预期抛出 AuthorizationError。')
}

describe('可信租户上下文（DOC-12 §3.2）', () => {
  it('[ID_PENDING] 可信身份缺失时 fail-closed', () => {
    expectAuthError(
      () => establishTenantContext({
        identity: undefined,
        snapshot: snapshotOf(),
        claimedTenantId: undefined,
      }),
      'tenantIdentityUnavailable',
    )
  })

  it('[ID_PENDING] 声称的租户与可信身份不一致时拒绝且不泄露对方标识', () => {
    const error = expectAuthError(
      () => establishTenantContext({
        identity: { tenantId: 'tenant-a' },
        snapshot: snapshotOf(),
        claimedTenantId: 'tenant-b',
      }),
      'tenantMismatch',
    )

    expect(error.message).not.toContain('tenant-b')
  })

  it('[ID_PENDING] 声称值与可信身份一致时建立上下文', () => {
    const snapshot = snapshotOf()
    const context = establishTenantContext({
      identity: { tenantId: 'tenant-a' },
      snapshot,
      claimedTenantId: 'tenant-a',
    })

    expect(context.tenantId).toBe('tenant-a')
    expect(context.configSnapshotRef).toBe(snapshot.ref)
    expect(Object.isFrozen(context)).toBe(true)
  })

  it('[ID_PENDING] 未配置 tenants 时使用单租户身份与全局时区', () => {
    const snapshot = snapshotOf()
    const context = establishTenantContext({
      identity: { tenantId: SINGLE_TENANT_ID },
      snapshot,
      claimedTenantId: undefined,
    })

    expect(context.tenantId).toBe(SINGLE_TENANT_ID)
    expect(context.timezone).toBe('Asia/Shanghai')
    expect(context.configSnapshotRef).toBe(snapshot.ref)
  })

  it('[ID_PENDING] 租户自身时区优先，缺失时继承全局时区', () => {
    const own = establishTenantContext({
      identity: { tenantId: 'tenant-a' },
      snapshot: snapshotOf(minimalConfig({
        global: { timezone: 'UTC' },
        tenants: [{ tenantId: 'tenant-a', timezone: 'America/New_York' }],
      })),
      claimedTenantId: undefined,
    })
    expect(own.timezone).toBe('America/New_York')

    const inherited = establishTenantContext({
      identity: { tenantId: 'tenant-a' },
      snapshot: snapshotOf(minimalConfig({
        global: { timezone: 'UTC' },
        tenants: [{ tenantId: 'tenant-a' }],
      })),
      claimedTenantId: undefined,
    })
    expect(inherited.timezone).toBe('UTC')
  })

  it('[ID_PENDING] 未配置或已禁用的租户 fail-closed', () => {
    expectAuthError(
      () => establishTenantContext({
        identity: { tenantId: 'tenant-b' },
        snapshot: snapshotOf(minimalConfig({ tenants: [{ tenantId: 'tenant-a' }] })),
        claimedTenantId: undefined,
      }),
      'tenantNotConfigured',
    )

    expectAuthError(
      () => establishTenantContext({
        identity: { tenantId: 'tenant-a' },
        snapshot: snapshotOf(minimalConfig({
          tenants: [{ tenantId: 'tenant-a', enabled: false }],
        })),
        claimedTenantId: undefined,
      }),
      'tenantDisabled',
    )
  })

  it('[ID_PENDING] 上下文允许没有快照引用', () => {
    const context = createTenantContext({
      tenantId: 'tenant-a',
      timezone: 'UTC',
      configSnapshotRef: undefined,
    })

    expect(context.configSnapshotRef).toBeUndefined()
  })

  it('[ID_PENDING] 跨租户访问被拒绝且错误不含目标租户数据', () => {
    const context = createTenantContext({
      tenantId: 'tenant-a',
      timezone: 'UTC',
      configSnapshotRef: undefined,
    })

    expect(() => { assertTenantAccess(context, 'tenant-a') }).not.toThrow()
    const error = expectAuthError(() => { assertTenantAccess(context, 'tenant-b') }, 'tenantCrossAccessDenied')
    expect(error.message).not.toContain('tenant-b')
  })
})

describe('运行时租户解析与热更新（DOC-12 §3.1、DOC-14 §7）', () => {
  it('[ID_PENDING] 单租户模式解析固定身份并拒绝伪造租户', () => {
    const runtime = createRiskAgentRuntime({ config: configOf(), now: () => 0 })

    expect(runtime.resolveTenant().tenantId).toBe(SINGLE_TENANT_ID)
    expectAuthError(() => runtime.resolveTenant('tenant-a'), 'tenantMismatch')
  })

  it('[ID_PENDING] 恰有一个启用租户时可确定可信身份', () => {
    const runtime = createRiskAgentRuntime({
      config: configOf(minimalConfig({
        tenants: [{ tenantId: 'tenant-a' }],
      })),
      now: () => 0,
    })

    expect(resolveConfiguredIdentity(runtime.config)).toBe('tenant-a')
    expect(runtime.resolveTenant().tenantId).toBe('tenant-a')
    expect(runtime.resolveTenant('tenant-a').tenantId).toBe('tenant-a')
    expectAuthError(() => runtime.resolveTenant('tenant-b'), 'tenantMismatch')
  })

  it('[ID_PENDING] 多个启用租户或全部禁用时无法确定可信身份', () => {
    const multiple = createRiskAgentRuntime({
      config: configOf(minimalConfig({
        tenants: [{ tenantId: 'tenant-a' }, { tenantId: 'tenant-b' }],
      })),
      now: () => 0,
    })
    expect(resolveConfiguredIdentity(multiple.config)).toBeUndefined()
    expectAuthError(() => multiple.resolveTenant(), 'tenantIdentityUnavailable')

    const disabled = createRiskAgentRuntime({
      config: configOf(minimalConfig({
        tenants: [{ tenantId: 'tenant-a', enabled: false }],
      })),
      now: () => 0,
    })
    expect(resolveConfiguredIdentity(disabled.config)).toBeUndefined()
    expectAuthError(() => disabled.resolveTenant(), 'tenantIdentityUnavailable')
  })

  it('[ID_PENDING] 热更新后租户上下文解析到新快照且审计留痕', () => {
    const runtime = createRiskAgentRuntime({ config: configOf(), now: () => 0 })
    const firstRef = runtime.resolveTenant().configSnapshotRef

    const next = runtime.reload(minimalConfig({ global: { timezone: 'UTC' } }))

    expect(next.version).toBe(2)
    expect(next.ref).not.toBe(firstRef)
    expect(runtime.resolveTenant().configSnapshotRef).toBe(next.ref)
    expect(runtime.resolveTenant().timezone).toBe('UTC')
    expect(runtime.audit.events.map(event => [event.action, event.result])).toEqual([
      ['config.load', 'SUCCESS'],
      ['config.reload', 'SUCCESS'],
    ])
  })
})
