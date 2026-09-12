import type { Game } from "../../core/domain/game.js";
import type { GameRepository } from "../../core/application/ports/game-repository.js";
import {
  pruneRepositoryCache,
  resolveRepositoryCacheOptions,
  type RepositoryCacheOptions,
} from "../../adapters/persistence/repository-cache.js";

/**
 * `GameRepository` en memoria (US-05): mismo contrato observable que el
 * adaptador Mongo, sin mongoose ni IO. Base de los tests de US-06.
 *
 * Devuelve copias defensivas (`structuredClone`) para que los tests no
 * compartan referencias mutables con el estado interno del repositorio.
 */
export interface InMemoryGameRepository extends GameRepository {
  /**
   * Extensión de test (no es parte del puerto): siembra una partida en el
   * store, equivalente al `GameModel.create` que usa la suite de contrato para
   * Mongo. `save` es update-only y no crea.
   */
  seed(game: Game): void;

  /**
   * Extensión de test (no es parte del puerto): paralela a
   * `MongoGameRepository.getCached`, permite verificar la poda de caché (US-08)
   * sin depender de `findById` (que en Mongo recargaría desde la DB).
   */
  getCached(gameId: string): Game | undefined;
}

export function createInMemoryGameRepository(
  options: RepositoryCacheOptions = {}
): InMemoryGameRepository {
  const games = new Map<string, Game>();
  const cacheOptions = resolveRepositoryCacheOptions(options);

  const cloneGame = (game: Game): Game => structuredClone(game);

  return {
    seed(game) {
      games.set(game.id, cloneGame(game));
    },

    getCached(gameId) {
      const game = games.get(gameId);
      return game ? cloneGame(game) : undefined;
    },

    async findById(gameId) {
      const game = games.get(gameId);
      return game ? cloneGame(game) : null;
    },

    async findByIdFresh(gameId) {
      // En memoria no hay fuente externa que pueda escribir por detrás, así que
      // la lectura fresca coincide con `findById` (fuente única + copia defensiva).
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
      // Update-only: el WS no crea partidas; si no existe, no-op (paridad legacy).
      if (!games.has(game.id)) return;
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
      // Misma semántica que el adaptador Mongo (US-08): TTL + tope, nunca
      // `waiting`/`active`. Al no haber DB, lo podado desaparece del store.
      return pruneRepositoryCache(games, cacheOptions);
    },
  };
}
