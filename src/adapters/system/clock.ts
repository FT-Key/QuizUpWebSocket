import type { Clock } from "../../core/application/ports/clock.js";

export function createSystemClock(): Clock {
  return { now: () => Date.now() };
}
