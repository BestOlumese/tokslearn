export interface Clock {
  now(): Date
}

export const systemClock: Clock = { now: () => new Date() }

/** For tests: time only moves when you say so. */
export function fixedClock(start: Date): Clock & { advance(ms: number): void } {
  let current = start.getTime()
  return {
    now: () => new Date(current),
    advance: (ms) => {
      current += ms
    },
  }
}
