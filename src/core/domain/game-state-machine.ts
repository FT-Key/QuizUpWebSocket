import type { Game } from "./game.js";

/** `true` si la partida puede iniciarse (paridad con el guard del handler `start-game`). */
export function canStart(game: Game): boolean {
  return game.status === "waiting";
}

/**
 * waiting -> active. Precondición: `canStart(game)` (el caller valida; `start`
 * no lanza ni valida status, igual que `gameStore.startGame`).
 * Efecto: status="active", currentQuestionIndex=0, currentQuestionStartTime=now.
 */
export function start(game: Game, now: number): void {
  game.status = "active";
  game.currentQuestionIndex = 0;
  game.currentQuestionStartTime = now;
}

export type NextQuestionOutcome = "advanced" | "finished";

/**
 * active -> active (avanza índice y startTime=now) si quedan preguntas;
 * active -> finished si no quedan (NO avanza índice ni toca startTime: paridad
 * con `nextQuestion`/`finishGame` legacy).
 */
export function nextQuestion(game: Game, now: number): NextQuestionOutcome {
  if (game.currentQuestionIndex + 1 < game.questions.length) {
    game.currentQuestionIndex += 1;
    game.currentQuestionStartTime = now;
    return "advanced";
  }
  finish(game);
  return "finished";
}

/** Cualquier estado -> finished. No resetea `currentQuestionStartTime` (paridad). */
export function finish(game: Game): void {
  game.status = "finished";
}

/** waiting -> cancelled. Devuelve `false` sin mutar si no estaba `waiting` (paridad `cancelGame`). */
export function cancel(game: Game): boolean {
  if (game.status !== "waiting") return false;
  game.status = "cancelled";
  return true;
}

/** Activa/desactiva el bloqueo de ingreso. Sin guard de estado (paridad `adminHandlers.ts:15`). */
export function lock(game: Game, locked: boolean): void {
  game.locked = locked;
}

/** Fin de la pregunta actual: `currentQuestionStartTime = 0`, status intacto (paridad `finishCurrentQuestion`). */
export function finishCurrentQuestion(game: Game): void {
  game.currentQuestionStartTime = 0;
}
