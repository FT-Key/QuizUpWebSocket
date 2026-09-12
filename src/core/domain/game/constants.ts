import type { GameStatus } from "../game.js";

/**
 * Estados del agregado `Game` (contrato §1). Fuente única del repo: dominio,
 * casos de uso y adapters referencian estas constantes en vez de literales.
 */
export const GAME_STATUS = {
  WAITING: "waiting",
  ACTIVE: "active",
  FINISHED: "finished",
  CANCELLED: "cancelled",
} as const satisfies Record<string, GameStatus>;

/** `currentQuestionStartTime === 0` (contrato §1): pregunta no iniciada. */
export const QUESTION_NOT_STARTED = 0;
