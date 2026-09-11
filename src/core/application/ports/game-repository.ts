import type { Game, Player } from "../../../types/types.js";

export interface GameRepository {
  /** Partida por id (== gameCode). Cache-first: si no está en caché, carga de Mongo y la cachea. */
  findById(gameId: string): Promise<Game | null>;

  /** Partida que contiene al jugador (paridad con el escaneo actual de `submitAnswer`). */
  findByPlayerId(playerId: string): Promise<Game | null>;

  /** Persiste el estado completo del agregado (status, locked, índices y players). */
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
