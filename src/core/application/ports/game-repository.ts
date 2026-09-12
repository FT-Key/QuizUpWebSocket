import type { Game } from "../../domain/game.js";
import type { Player } from "../../domain/player.js";

/**
 * Persistencia del agregado `Game` (puerto de `core`, US-05; persistencia
 * diferencial de jugadores, US-19).
 *
 * Semántica común a todas las implementaciones:
 * - `save` es **update-only**: actualiza el estado de una partida existente y
 *   **no la crea**; si no existe, no-op. Persiste SOLO estado (name, status,
 *   índices, locked); **no toca `players`**.
 * - Los jugadores se persisten con operaciones diferenciales atómicas por
 *   documento: `addPlayer`/`removePlayer`/`updatePlayers`. Ninguna reemplaza el
 *   array completo, así que no pisan altas/bajas concurrentes de otros procesos
 *   (p. ej. el join REST de Next).
 * - `findById`/`findByIdFresh`/`findByPlayerId` pueden devolver la referencia
 *   viva de la caché (adaptador Mongo) o una copia (fake): el aliasing no forma
 *   parte del contrato. Tras mutar el juego, los consumidores SIEMPRE deben
 *   persistir con la operación correspondiente (save/addPlayer/removePlayer/
 *   updatePlayers); nunca deben depender de mutar la referencia devuelta.
 * - La caché viva puede contener mutaciones aún no persistidas (p. ej.
 *   `answers`/`score` durante una pregunta activa de `submit-answer`); las
 *   escrituras del adaptador no la pisan con el documento crudo (`save`
 *   conserva el argumento y `removePlayer` actualiza la entrada); solo las
 *   lecturas frescas y `addPlayer` refrescan desde Mongo.
 */
export interface GameRepository {
  /**
   * Partida por id (== gameCode). Cache-first: si no está en caché, carga de
   * Mongo y la cachea. Mismo aliasing que el resto del puerto: tras mutar, la
   * persistencia va con la operación correspondiente (`save` para el estado;
   * `addPlayer`/`removePlayer`/`updatePlayers` para jugadores).
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
   * Persiste SOLO el estado mutable del agregado: `name`, `status`,
   * `currentQuestionIndex`, `currentQuestionStartTime`, `questionTimeLimit` y
   * `locked`. **No persiste `players`** (usar `addPlayer`/`removePlayer`/
   * `updatePlayers`). Update-only: si la partida no existe, no-op (sin upsert).
   */
  save(game: Game): Promise<void>;

  /**
   * Alta atómica de un jugador al final de `players` (`$push` condicionado por
   * id). Idempotente por `player.id`: si ya existe, no lo duplica ni lo
   * modifica. No-op silencioso si la partida no existe.
   */
  addPlayer(gameId: string, player: Player): Promise<void>;

  /**
   * Baja atómica de un jugador por id (`$pull`). Idempotente: si el jugador no
   * está, no-op. No-op silencioso si la partida no existe.
   */
  removePlayer(gameId: string, playerId: string): Promise<void>;

  /**
   * Actualiza selectivamente campos mutables de jugadores EXISTENTES
   * (`answers`, `score`, `avatar`); nunca inserta ni elimina, y los ids
   * desconocidos son no-op. Generaliza la persistencia selectiva de jugadores
   * de US-05; `name` no se persiste aquí porque el dominio no lo muta tras el
   * alta. No refresca la caché: la referencia viva del caller ya refleja la
   * mutación.
   */
  updatePlayers(gameId: string, players: Player[]): Promise<void>;

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
