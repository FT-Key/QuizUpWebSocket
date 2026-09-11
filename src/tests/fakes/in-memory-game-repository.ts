import type { Game } from "../../core/domain/game.js";
import type { GameRepository } from "../../core/application/ports/game-repository.js";

/**
 * `GameRepository` en memoria (US-05): mismo contrato observable que el
 * adaptador Mongo, sin mongoose ni IO. Base de los tests de US-06.
 *
 * Devuelve copias defensivas (`structuredClone`) para que los tests no
 * compartan referencias mutables con el estado interno del repositorio.
 */
export function createInMemoryGameRepository(): GameRepository {
  const games = new Map<string, Game>();

  const cloneGame = (game: Game): Game => structuredClone(game);

  return {
    async findById(gameId) {
      const game = games.get(gameId);
      return game ? cloneGame(game) : null;
    },

    async findByPlayerId(playerId) {
      for (const game of games.values()) {
        if (game.players.some((p) => p.id === playerId)) {
          return cloneGame(game);
        }
      }
      return null;
    },

    async save(game) {
      games.set(game.id, cloneGame(game));
    },

    async persistPlayers(gameId, players) {
      const stored = games.get(gameId);
      if (!stored) return;

      for (const player of players) {
        const target = stored.players.find((p) => p.id === player.id);
        if (!target) continue;
        target.answers = { ...player.answers };
        target.score = player.score;
      }
    },

    async listAll() {
      return [...games.values()]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(cloneGame);
    },

    async findWaitingCreatedBefore(cutoff) {
      const cutoffTime = cutoff.getTime();
      return [...games.values()]
        .filter(
          (game) => game.status === "waiting" && game.createdAt.getTime() < cutoffTime
        )
        .map(cloneGame);
    },

    async prune() {
      // Stub de US-05: la política de poda real llega en US-08.
      return 0;
    },
  };
}
