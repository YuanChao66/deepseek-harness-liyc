/**
 * 统一结构化错误（DOC-11 §3.2/§3.3）。
 * 九类类别名是稳定取值域；具体错误类随所属模块落地，当前只实现配置与租户链路使用的三类。
 * @module
 */

import type { TenantId } from '../types/index.ts'

/** 错误类别的稳定取值域（DOC-11 §3.2）。 */
export const ERROR_CATEGORIES = [
  'Validation',
  'Authorization',
  'NotFound',
  'Conflict',
  'Timeout',
  'Cancellation',
  'Persistence',
  'ExternalDependency',
  'Internal',
] as const

/** 错误类别。 */
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number]

/** 构造结构化错误的可选上下文。 */
export interface StructuredErrorOptions {
  /** 脱敏后的租户标识。 */
  tenantId?: TenantId
  /** 底层原始异常；只进日志，不进模型响应。 */
  cause?: unknown
}

/** 所有层统一使用的结构化错误（DOC-11 §3.3）。 */
export interface StructuredError {
  /** 唯一错误类别。 */
  readonly category: ErrorCategory
  /** 跨版本稳定的细粒度错误码。 */
  readonly code: string
  /** 用户可读、不含敏感信息的消息。 */
  readonly message: string
  /** 脱敏后的租户标识；无租户上下文时为 undefined。 */
  readonly tenantId: TenantId | undefined
  /** 是否可安全重试。 */
  readonly retryable: boolean
  /** 底层原始异常链；仅进日志。 */
  readonly cause: unknown
}

/** 结构化错误的公共基类。 */
export abstract class StructuredErrorBase extends Error implements StructuredError {
  readonly category: ErrorCategory
  readonly code: string
  readonly tenantId: TenantId | undefined
  readonly retryable: boolean
  override readonly cause: unknown

  /**
   * @param category - 唯一错误类别。
   * @param code - 稳定错误码。
   * @param message - 用户可读消息。
   * @param retryable - 是否可安全重试。
   * @param options - 租户标识与底层原因。
   */
  protected constructor(
    category: ErrorCategory,
    code: string,
    message: string,
    retryable: boolean,
    options: StructuredErrorOptions = {},
  ) {
    super(message)
    this.name = new.target.name
    this.category = category
    this.code = code
    this.tenantId = options.tenantId
    this.retryable = retryable
    this.cause = options.cause
  }
}

/** 入参非法、Schema 校验失败或字段越界（DOC-11 §3.2）。 */
export class ValidationError extends StructuredErrorBase {
  /** 出错字段路径，`$` 为根。 */
  readonly fieldPath: string

  /**
   * @param code - 稳定错误码。
   * @param message - 用户可读消息。
   * @param fieldPath - 可定位的字段路径。
   * @param options - 租户标识与底层原因。
   */
  constructor(code: string, message: string, fieldPath: string, options: StructuredErrorOptions = {}) {
    super('Validation', code, message, false, options)
    this.fieldPath = fieldPath
  }
}

/** 越权、跨租户未授权或伪造租户标识被拒（DOC-11 §3.2）。 */
export class AuthorizationError extends StructuredErrorBase {
  /**
   * @param code - 稳定错误码。
   * @param message - 用户可读消息；不得包含对方租户的任何数据。
   * @param options - 租户标识与底层原因。
   */
  constructor(code: string, message: string, options: StructuredErrorOptions = {}) {
    super('Authorization', code, message, false, options)
  }
}

/** 未预期内部状态或不可分类缺陷（DOC-11 §3.2）。 */
export class InternalError extends StructuredErrorBase {
  /**
   * @param code - 稳定错误码。
   * @param message - 用户可读消息。
   * @param options - 租户标识与底层原因。
   */
  constructor(code: string, message: string, options: StructuredErrorOptions = {}) {
    super('Internal', code, message, false, options)
  }
}
