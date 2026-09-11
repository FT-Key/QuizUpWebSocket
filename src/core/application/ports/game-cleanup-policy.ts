import type { Game } from "../../domain/game.js";

export interface GameCleanupPolicy {
  /** `true` si la partida debe cerrarse por inactividad en `now` (epoch ms). */
  isExpired(game: Game, now: number): boolean;
}
