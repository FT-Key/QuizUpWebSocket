import type { Game } from "../../../core/domain/game.js";
import type { Player } from "../../../core/domain/player.js";
import type { GameRepository } from "../../../core/application/ports/game-repository.js";
import { GameModel } from "./game.schema.js";
import { answersToRecord, toDomain, toPersistence } from "./game.mapper.js";
import type { GameDoc } from "../../../types/db.js";

/**
 * Puerto `GameRepository` + accesorios de caché internos del adaptador.
 *
 * Los handlers legacy cachean en `gameStore`; este adaptador encapsula la caché
 * en memoria de la partida (paridad con `addGameFromDb`/`getGame`) sin
 * contaminar el puerto de `core`. Nadie lo cablea al runtime todavía (US-06/07).
 *
 * Aliasing: la caché guarda **referencias vivas** del dominio, así que
 * `findById`/`findByPlayerId` pueden devolverlas tal cual (el fake en memoria,
 * en cambio, clona). El aliasing no es contrato: tras mutar hay que llamar a
 * `save`/`persistPlayers` para persistir.
 */
export interface MongoGameRepository extends GameRepository {
  cacheGame(game: Game): void;
  getCached(gameId: string): Game | undefined;
}

/**
 * Adaptador Mongo de `GameRepository`. Construcción pura: usa la conexión
 * global de mongoose recién cuando se invoca un método. Los errores de
 * Mongoose no se capturan aquí: suben al caller.
 */
export function createMongoGameRepository(): MongoGameRepository {
  const cache = new Map<string, Game>();

  const repository: MongoGameRepository = {
    cacheGame(game) {
      cache.set(game.id, game);
    },

    getCached(gameId) {
      return cache.get(gameId);
    },

    async findById(gameId) {
      // Cache-first: si no está, carga de Mongo y cachea. En hit devuelve la
      // referencia viva de la caché (mutarla no persiste: usar `save`).
      const cached = cache.get(gameId);
      if (cached) return cached;

      const doc = await GameModel.findOne({ gameCode: gameId }).lean<GameDoc | null>();
      if (!doc) return null;

      const game = toDomain(doc);
      cache.set(game.id, game);
      return game;
    },

    async findByPlayerId(playerId) {
      // Escaneo de caché (paridad con `submitAnswer`); si no está, consulta
      // Mongo por `players.id`, cachea el resultado y lo devuelve.
      for (const game of cache.values()) {
        if (game.players.some((p) => p.id === playerId)) {
          return game;
        }
      }

      const doc = await GameModel.findOne({ "players.id": playerId }).lean<GameDoc | null>();
      if (!doc) return null;

      const game = toDomain(doc);
      cache.set(game.id, game);
      return game;
    },

    async save(game) {
      // Update-only (sin upsert): `$set` solo con campos mutables, no reescribe
      // questions/_id/createdAt/creatorId. Si la partida no existe, no-op: no se
      // cachea para no crear un "fantasma" (paridad con el fake). Si existe,
      // refresca la caché con el agregado recibido.
      const updated = await GameModel.findOneAndUpdate(
        { gameCode: game.id },
        { $set: toPersistence(game) }
      );

      if (updated) cache.set(game.id, game);
    },

    async persistPlayers(gameId, players) {
      if (players.length === 0) return;

      // Equivalente exacto al `bulkWrite` legacy de timeout/next-question/finish-game.
      const operations = players.map((player: Player) => ({
        updateOne: {
          filter: { gameCode: gameId, "players.id": player.id },
          update: {
            $set: {
              "players.$.answers": answersToRecord(player.answers),
              "players.$.score": player.score,
            },
          },
        },
      }));

      await GameModel.bulkWrite(operations);
    },

    async listAll() {
      const docs = await GameModel.find().sort({ createdAt: -1 }).lean<GameDoc[]>();
      return docs.map(toDomain);
    },

    async findWaitingCreatedBefore(cutoff) {
      const docs = await GameModel.find({
        status: "waiting",
        createdAt: { $lt: cutoff },
      }).lean<GameDoc[]>();
      return docs.map(toDomain);
    },

    async prune() {
      // Stub de US-05: la política TTL/tope real llega en US-08 dentro de este adaptador.
      return 0;
    },
  };

  return repository;
}
