export interface ScoringInput {
  readonly isCorrect: boolean;
  readonly remainingMs: number;
}

export interface ScoringStrategy {
  /** Puntos a sumar por una respuesta. Único lugar de la fórmula. */
  calculate(input: ScoringInput): number;
}
