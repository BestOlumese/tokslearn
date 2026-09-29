// Exam integrity signals (docs/10 §6): recorded, never blocking. Learners are told exactly what is
// recorded before they start. Over a threshold, the attempt is flagged for the instructor to
// review; a person decides, never this code.

export type IntegrityKind = 'focus_loss' | 'fullscreen_exit' | 'paste'

export interface Integrity {
  startIpHash?: string | null
  /** Other networks seen during the attempt (hashed, never raw IPs). */
  otherIpHashes?: string[]
  focusLosses?: number
  focusLossMs?: number
  fullscreenExits?: number
  pastes?: number
  flagReasons?: FlagReason[]
}

export type FlagReason = 'focus_loss' | 'fullscreen_exit' | 'paste' | 'network_change' | 'too_fast'

export const FLAG_THRESHOLDS = {
  focusLosses: 5,
  /** Out of the tab for a minute or more in total. */
  focusLossMs: 60_000,
  fullscreenExits: 3,
  pastes: 3,
  /** Less than this many seconds per question on average, with a passing score. */
  secondsPerQuestion: 5,
} as const

export function flagReasons(
  integrity: Integrity,
  attempt: { durationSec: number; questionCount: number; passed: boolean },
): FlagReason[] {
  const out: FlagReason[] = []
  if (
    (integrity.focusLosses ?? 0) >= FLAG_THRESHOLDS.focusLosses ||
    (integrity.focusLossMs ?? 0) >= FLAG_THRESHOLDS.focusLossMs
  ) {
    out.push('focus_loss')
  }
  if ((integrity.fullscreenExits ?? 0) >= FLAG_THRESHOLDS.fullscreenExits)
    out.push('fullscreen_exit')
  if ((integrity.pastes ?? 0) >= FLAG_THRESHOLDS.pastes) out.push('paste')
  if ((integrity.otherIpHashes ?? []).length > 0) out.push('network_change')
  if (
    attempt.passed &&
    attempt.questionCount > 0 &&
    attempt.durationSec < attempt.questionCount * FLAG_THRESHOLDS.secondsPerQuestion
  ) {
    out.push('too_fast')
  }
  return out
}
