/**
 * Domain events (docs/03 §6). Names are `<module>.<past_tense>`. Add each event here with its
 * payload type; the Inngest schemas in packages/jobs mirror these names.
 * Payloads carry ids, never personal data.
 */
export interface DomainEvents {
  'feature_flag.updated': { key: string; enabled: boolean }
}

export type EventName = keyof DomainEvents

export interface EventEmitter {
  /** Writes to the outbox in the caller's transaction; sent to Inngest after commit. */
  emit<N extends EventName>(name: N, payload: DomainEvents[N]): Promise<void>
}
