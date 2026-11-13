/**
 * 可信租户上下文建立与越权拒绝（DOC-12 §3）。
 * 租户标识只能来自可信边界（身份解析结果），工具入参最多作为「声称值」被比对，
 * 任何不一致都 fail-closed，且错误消息不包含对方租户的数据。
 * @module
 */

import { AuthorizationError } from '../../shared/index.ts'
import { createTenantContext } from '../../domain/index.ts'
import type { TenantContext } from '../../domain/index.ts'
import type { ConfigSnapshot } from '../config/index.ts'

/** 可信入口解析出的租户身份。 */
export interface TenantIdentity {
  /** 已由可信边界确认的租户标识。 */
  readonly tenantId: string
}

/** 建立租户上下文的输入。 */
export interface EstablishTenantContextInput {
  /** 可信身份；不可用时为 undefined。 */
  readonly identity: TenantIdentity | undefined
  /** 当前生效的配置快照。 */
  readonly snapshot: ConfigSnapshot
  /** 调用方声称的租户标识；只用于比对，不作为身份来源。 */
  readonly claimedTenantId: string | undefined
}

/**
 * 由可信身份建立租户上下文。
 * @param input - 可信身份、当前快照与声称的租户标识。
 * @returns 冻结的租户上下文。
 */
export function establishTenantContext(input: EstablishTenantContextInput): TenantContext {
  const { identity, snapshot, claimedTenantId } = input
  if (identity === undefined) {
    throw new AuthorizationError('tenantIdentityUnavailable', '未找到可信租户身份。')
  }
  if (claimedTenantId !== undefined && claimedTenantId !== identity.tenantId) {
    throw new AuthorizationError('tenantMismatch', '请求的租户与可信身份不一致。')
  }
  const { tenants, global } = snapshot.value
  const tenant: { readonly enabled: boolean; readonly timezone?: string } | undefined = tenants.find(
    candidate => candidate.tenantId === identity.tenantId,
  )
  const timezone = tenants.length > 0 ? configuredTimezone(tenant) ?? global.timezone : global.timezone
  return createTenantContext({
    tenantId: identity.tenantId,
    timezone,
    configSnapshotRef: snapshot.ref,
  })
}

/**
 * 读取已配置租户的时区，并对未配置/禁用租户 fail-closed。
 * @param tenant - 命中的租户配置。
 * @returns 租户时区；未配置时区时返回 undefined 以继承全局。
 */
function configuredTimezone(
  tenant: { readonly enabled: boolean; readonly timezone?: string } | undefined,
): string | undefined {
  if (tenant === undefined) {
    throw new AuthorizationError('tenantNotConfigured', '租户未配置。')
  }
  if (!tenant.enabled) {
    throw new AuthorizationError('tenantDisabled', '租户已禁用。')
  }
  return tenant.timezone
}

/**
 * 拒绝跨租户访问。
 * @param context - 当前调用方的租户上下文。
 * @param targetTenantId - 被访问数据所属租户。
 */
export function assertTenantAccess(context: TenantContext, targetTenantId: string): void {
  if (context.tenantId !== targetTenantId) {
    throw new AuthorizationError('tenantCrossAccessDenied', '禁止跨租户访问。')
  }
}
