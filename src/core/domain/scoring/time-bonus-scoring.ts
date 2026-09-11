import type { ScoringInput, ScoringStrategy } from "./scoring-strategy.js";

/** `1 + floor(remainingMs / 10)` si acierta y `remainingMs > 0`; si no, `0`. */
export class TimeBonusScoring implements ScoringStrategy {
  calculate({ isCorrect, remainingMs }: ScoringInput): number {
    if (!isCorrect) return 0;
    return 1 + (remainingMs > 0 ? Math.floor(remainingMs / 10) : 0);
  }
}
