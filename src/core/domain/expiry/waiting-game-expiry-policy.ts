import type { Game } from "../game.js";

/** Firma estructuralmente compatible con `GameCleanupPolicy` (core/application) sin invertir la dependencia. */
export interface WaitingGameExpiryPolicy {
  isExpired(game: Game, now: number): boolean;
}

/**
 * Expira partidas `waiting` cuya antigüedad supera `expiryMs`.
 * Paridad con `isWaitingGameExpired` (cleanupStaleGames.ts:15-22):
 * comparación estricta `>`, fecha inválida ⇒ `false`, y el guard de status sube
 * del caller a la política (el cleanup solo pregunta por candidatas `waiting`).
 */
export function createWaitingGameExpiryPolicy(expiryMs: number): WaitingGameExpiryPolicy {
  return {
    isExpired(game, now) {
      if (game.status !== "waiting") return false;
      const created = game.createdAt.getTime();
      if (!Number.isFinite(created)) return false;
      return now - created > expiryMs;
    },
  };
}
