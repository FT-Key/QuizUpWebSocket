import type { Game } from "../../domain/game.js";
import type { Player } from "../../domain/player.js";

/**
 * Persistencia del agregado `Game` (puerto de `core`, US-05).
 *
 * Semántica común a todas las implementaciones:
 * - `save` es **update-only**: actualiza una partida existente y **no la crea**
 *   (las partidas nacen en Next/REST; el WS nunca las crea, igual que el
 *   `findOneAndUpdate` legacy sin upsert). Si la partida no existe, es no-op.
 * - `findById`/`findByIdFresh`/`findByPlayerId` pueden devolver la
 *   **referencia viva** de la caché (adaptador Mongo) o una **copia** (fake en
 *   memoria): el aliasing no forma parte del contrato. Tras mutar el juego, los
 *   consumidores SIEMPRE deben llamar a `save`/`persistPlayers` para persistir;
 *   nunca deben depender de mutar la referencia devuelta.
 */
export interface GameRepository {
  /**
   * Partida por id (== gameCode). Cache-first: si no está en caché, carga de
   * Mongo y la cachea. Mismo aliasing que el resto del puerto: persistir con
   * `save` tras mutar.
   */
  findById(gameId: string): Promise<Game | null>;

  /**
   * Partida por id con lectura SIEMPRE fresca de la fuente (sin caché), y
   * refresca la caché con el resultado (equivalente a `GameModel.findOne` +
   * `gameStore.addGameFromDb` del join legacy). Necesaria para ver escrituras
   * de otros procesos (p. ej. el join REST de Next) antes de mutar y guardar.
   */
  findByIdFresh(gameId: string): Promise<Game | null>;

  /**
   * Partida que contiene al jugador. Busca primero en la caché en memoria
   * (paridad con el escaneo actual de `submitAnswer`); si no está, consulta
   * Mongo por `players.id` y cachea el resultado. Mismo aliasing que `findById`.
   */
  findByPlayerId(playerId: string): Promise<Game | null>;

  /**
   * Persiste el estado mutable del agregado (name, status, índices, locked y
   * players). **Update-only**: si la partida no existe, no-op (sin upsert).
   */
  save(game: Game): Promise<void>;

  /** Persiste solo `answers` + `score` de los jugadores (equivalente al `bulkWrite` actual). */
  persistPlayers(gameId: string, players: Player[]): Promise<void>;

  /** Todas las partidas, orden `createdAt desc` (orden actual del dashboard). */
  listAll(): Promise<Game[]>;

  /** Partidas `waiting` creadas antes de `cutoff` (query actual del cleanup). */
  findWaitingCreatedBefore(cutoff: Date): Promise<Game[]>;

  /**
   * Poda la caché en memoria (contrato usado por US-08; parámetros TTL/tope son
   * decisión de US-08 dentro del adaptador).
   */
  prune(): Promise<number>;
}
