import type { Clock } from "../../core/application/ports/clock.js";

export interface FixedClock extends Clock {
  set(ms: number): void;
  advance(ms: number): void;
}

/** `Clock` de test (US-06): tiempo fijo, avanzable a voluntad; nunca `Date.now()`. */
export function createFixedClock(initialMs = 0): FixedClock {
  let current = initialMs;

  return {
    now: () => current,
    set(ms) {
      current = ms;
    },
    advance(ms) {
      current += ms;
    },
  };
}
