import type { ErrorCode } from '@tokslearn/contract'

export type ErrorDetails = Readonly<Record<string, unknown>>

/**
 * Base for every expected failure in core. The API maps `code` to an oRPC status using the
 * contract's error catalog (docs/06 §4); `details` becomes `error.data`.
 */
export class DomainError extends Error {
  readonly code: ErrorCode
  readonly details: ErrorDetails

  constructor(code: ErrorCode, details: ErrorDetails = {}, message?: string) {
    super(message ?? code)
    this.name = new.target.name
    this.code = code
    this.details = details
  }
}

type NotFoundCode = Extract<ErrorCode, `${string}_NOT_FOUND`>

export class NotFoundError extends DomainError {
  constructor(code: NotFoundCode, details?: ErrorDetails) {
    super(code, details)
  }
}

export class ForbiddenError extends DomainError {
  constructor(code: ErrorCode = 'FORBIDDEN', details?: ErrorDetails) {
    super(code, details)
  }
}

export class ConflictError extends DomainError {}

export class ValidationError extends DomainError {
  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super('VALIDATION_FAILED', { issues })
  }
}

/** A business rule said no, e.g. REFUND_WINDOW_CLOSED. */
export class RuleViolationError extends DomainError {}

/** A provider (Paystack, Dojah, Bunny…) failed or timed out. */
export class ExternalServiceError extends DomainError {
  constructor(code: ErrorCode, details?: ErrorDetails, options?: { cause?: unknown }) {
    super(code, details)
    if (options?.cause !== undefined) this.cause = options.cause
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError
