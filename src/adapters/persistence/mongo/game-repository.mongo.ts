import type { Game } from "../../../core/domain/game.js";
import { GAME_STATUS } from "../../../core/domain/game/constants.js";
import type { GameRepository } from "../../../core/application/ports/game-repository.js";
import { GameModel } from "./game.schema.js";
import {
  numberMapToRecord,
  toDomain,
  toPersistence,
  toPersistencePlayer,
} from "./game.mapper.js";
import type { GameDoc } from "../../../types/db.js";
import {
  pruneRepositoryCache,
  resolveRepositoryCacheOptions,
  type RepositoryCacheOptions,
} from "../repository-cache.js";

/**
 * Puerto `GameRepository` + accesorios de caché internos del adaptador.
 *
 * Los handlers legacy cachean en `gameStore`; este adaptador encapsula la caché
 * en memoria de la partida (paridad con `addGameFromDb`/`getGame`) sin
 * contaminar el puerto de `core`. Nadie lo cablea al runtime todavía (US-06/07).
 *
 * Aliasing: la caché guarda **referencias vivas** del dominio, así que
 * `findById`/`findByPlayerId` pueden devolverlas tal cual (el fake en memoria,
 * en cambio, clona). El aliasing no es contrato: tras mutar hay que persistir
 * con `save` (estado) o con las operaciones diferenciales de jugadores
 * (`addPlayer`/`removePlayer`/`updatePlayers`).
 *
 * La caché viva puede contener mutaciones aún no persistidas (p. ej.
 * `answers`/`score` durante una pregunta activa de `submit-answer`); las
 * escrituras del adaptador no la pisan con el documento crudo (`save` conserva
 * el argumento y `removePlayer` actualiza la entrada); solo las lecturas
 * frescas (`findByIdFresh`) y `addPlayer` refrescan desde Mongo.
 */
export interface MongoGameRepository extends GameRepository {
  cacheGame(game: Game): void;
  getCached(gameId: string): Game | undefined;
}

/**
 * Adaptador Mongo de `GameRepository`. Construcción pura: usa la conexión
 * global de mongoose recién cuando se invoca un método. Los errores de
 * Mongoose no se capturan aquí: suben al caller. La caché aplica la política
 * TTL/tope de `RepositoryCacheOptions` al invocar `prune()` (US-08).
 */
export function createMongoGameRepository(
  options: RepositoryCacheOptions = {}
): MongoGameRepository {
  const cache = new Map<string, Game>();
  const cacheOptions = resolveRepositoryCacheOptions(options);

  const repository: MongoGameRepository = {
    cacheGame(game) {
      cache.set(game.id, game);
    },

    getCached(gameId) {
      return cache.get(gameId);
    },

    async findById(gameId) {
      // Cache-first: si no está, carga de Mongo y cachea. En hit devuelve la
      // referencia viva de la caché: mutarla no persiste; usar `save` para
      // estado y `addPlayer`/`removePlayer`/`updatePlayers` para jugadores.
      const cached = cache.get(gameId);
      if (cached) return cached;

      const doc = await GameModel.findOne({ gameCode: gameId }).lean<GameDoc | null>();
      if (!doc) return null;

      const game = toDomain(doc);
      cache.set(game.id, game);
      return game;
    },

    async findByIdFresh(gameId) {
      // Lectura SIEMPRE fresca: a diferencia de `findById` (cache-first), ignora
      // la caché y va a Mongo en cada llamada. El resultado refresca la caché
      // (paridad con el `GameModel.findOne` + `gameStore.addGameFromDb` del join
      // legacy), para que las escrituras de otros procesos (p. ej. el join REST
      // de Next) se vean antes de mutar y persistir de forma diferencial. Los
      // misses no se cachean: no crea "fantasmas".
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
      // Update-only (sin upsert) y state-only (US-19): `$set` solo con campos
      // mutables de estado, sin reescribir questions/_id/createdAt/creatorId ni
      // `players` (esos van por addPlayer/removePlayer/updatePlayers). Si la
      // partida no existe, no-op: no se cachea para no crear un "fantasma"
      // (paridad con el fake). Si existe, la caché conserva el ARGUMENTO (la
      // referencia viva, con las mutaciones en memoria aún no persistidas:
      // answers/score de submit-answer); nunca se pisa con el documento crudo
      // del update, que solo se usa para confirmar el match.
      const matched = await GameModel.findOneAndUpdate(
        { gameCode: game.id },
        { $set: toPersistence(game) }
      ).lean<GameDoc | null>();

      if (matched) cache.set(game.id, game);
    },

    async addPlayer(gameId, player) {
      // Alta atómica (`$push`) condicionada por id: si el jugador ya está, el
      // filtro no matchea y la operación es no-op idempotente. Doc inexistente
      // ⇒ `findOneAndUpdate` devuelve null: no-op sin cachear fantasmas.
      const updated = await GameModel.findOneAndUpdate(
        { gameCode: gameId, "players.id": { $ne: player.id } },
        { $push: { players: toPersistencePlayer(player, gameId) } },
        { new: true }
      ).lean<GameDoc | null>();

      if (updated) cache.set(gameId, toDomain(updated));
    },

    async removePlayer(gameId, playerId) {
      // Baja atómica (`$pull`) e idempotente: sin coincidencias no hay cambio.
      // Doc inexistente ⇒ null: no-op sin cachear fantasmas.
      const updated = await GameModel.findOneAndUpdate(
        { gameCode: gameId },
        { $pull: { players: { id: playerId } } },
        { new: true }
      ).lean<GameDoc | null>();

      if (!updated) return;

      // La caché viva puede llevar mutaciones en memoria sin persistir
      // (answers/score de submit-answer): no se pisa con el documento crudo.
      // Si la partida está cacheada, se quita al jugador sobre la referencia
      // viva (idempotente: si no está, la entrada queda igual); si no lo está,
      // se cachea la copia recién leída de Mongo.
      const cached = cache.get(gameId);
      if (cached) {
        cached.players = cached.players.filter((p) => p.id !== playerId);
        return;
      }

      cache.set(gameId, toDomain(updated));
    },

    async updatePlayers(gameId, players) {
      if (players.length === 0) return;

      // Equivalente al `bulkWrite` legacy de timeout/next-question/finish-game,
      // ampliado a `avatar` (US-19) y a `answerTimesMs` (US-20). Selectivo por
      // jugador existente: nunca inserta ni elimina; un id desconocido
      // simplemente no matchea. El `$set` de tiempos es condicional para no
      // fabricar `{}` en jugadores legacy (la ausencia debe sobrevivir).
      const operations = players.map((player) => ({
        updateOne: {
          filter: { gameCode: gameId, "players.id": player.id },
          update: {
            $set: {
              "players.$.answers": numberMapToRecord(player.answers),
              "players.$.score": player.score,
              "players.$.avatar": player.avatar ?? null,
              ...(player.answerTimesMs !== undefined
                ? { "players.$.answerTimesMs": numberMapToRecord(player.answerTimesMs) }
                : {}),
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
        status: GAME_STATUS.WAITING,
        createdAt: { $lt: cutoff },
      }).lean<GameDoc[]>();
      return docs.map(toDomain);
    },

    async prune() {
      // Solo toca la caché en memoria: las partidas siguen en Mongo y
      // `findById` las recarga si vuelven a consultarse.
      return pruneRepositoryCache(cache, cacheOptions);
    },
  };

  return repository;
}
