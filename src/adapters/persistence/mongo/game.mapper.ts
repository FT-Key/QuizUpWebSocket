import type { Game, GameStatus } from "../../../core/domain/game.js";
import type { Player } from "../../../core/domain/player.js";
import type { GameDoc } from "../../../types/db.js";
import { DEFAULT_TIME_LIMIT_MS } from "../../../constants/game.js";

/**
 * Conversión doc ↔ dominio del agregado Game (US-05).
 *
 * Única implementación de la conversión `answers` Map/objeto del repo.
 * `toDomain` es la migración 1:1 del `buildGame` legacy (`socket/helpers.ts`).
 */

/** Jugador tal como se persiste en Mongo (answers/answerTimesMs como objeto; Mongoose los castea a Map). */
export interface PersistedPlayer {
  id: string;
  name: string;
  gameId: string;
  answers: Record<string, number>;
  answerTimesMs: Record<string, number>;
  score: number;
  joinedAt: Date;
  avatar?: { seed: string; accessories?: string[] };
}

/** Campos de estado que `save` persiste (questions/createdAt/creatorId/players son de otras operaciones). */
export interface GamePersistence {
  gameCode: string;
  name: string;
  status: GameStatus;
  currentQuestionIndex: number;
  currentQuestionStartTime: number;
  questionTimeLimit: number;
  locked: boolean;
}

/**
 * Convierte un Map del driver (u objeto plano de `.lean()`, u otro valor
 * inesperado) a `Record<string, number>`. Sirve a `answers` y a
 * `answerTimesMs` (US-20). Tolerante a propósito: el legacy recibía ambas
 * representaciones según la ruta de lectura.
 */
export function numberMapToRecord(value: unknown): Record<string, number> {
  if (value instanceof Map) {
    return Object.fromEntries(value as Map<string, number>);
  }
  if (value && typeof value === "object") {
    return { ...(value as Record<string, number>) };
  }
  return {};
}

/** doc Mongo → dominio. Equivalente exacto al `buildGame` legacy (helpers.ts:6-47). */
export function toDomain(doc: GameDoc): Game {
  return {
    id: doc.gameCode,
    name: doc.name,
    status: doc.status,
    questions: (doc.questions ?? []).map((q) => ({
      id: q._id ? String(q._id) : "",
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
      image: q.image ?? null,
    })),
    players: (doc.players ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      gameId: doc.gameCode,
      answers: numberMapToRecord(p.answers),
      // Legacy: sin campo en el doc la clave se omite (no se fabrica `{}`);
      // con campo (aunque sea `{}`) se materializa el Record.
      ...(p.answerTimesMs !== undefined
        ? { answerTimesMs: numberMapToRecord(p.answerTimesMs) }
        : {}),
      score: p.score,
      joinedAt: p.joinedAt,
      avatar: p.avatar ?? undefined,
    })),
    createdAt: doc.createdAt,
    creatorId: doc.creatorId,
    currentQuestionIndex: doc.currentQuestionIndex,
    currentQuestionStartTime: doc.currentQuestionStartTime ?? 0,
    // `0` es un límite inválido (contrato: ms > 0): se conserva `||` para caer al default.
    questionTimeLimit: doc.questionTimeLimit || DEFAULT_TIME_LIMIT_MS,
    locked: doc.locked ?? false,
  };
}

/**
 * Agregado → campos persistibles de `save` (sin questions/_id/createdAt/
 * creatorId, y SIN `players`: US-19).
 *
 * No incluye `questions` ni `createdAt` ni `creatorId`: durante la partida no
 * cambian y sus `_id`/fechas no deben reescribirse. Tampoco incluye `players`:
 * la colección se persiste con operaciones diferenciales
 * (`addPlayer`/`removePlayer`/`updatePlayers`) para no pisar escrituras
 * concurrentes de otros procesos.
 */
export function toPersistence(game: Game): GamePersistence {
  return {
    gameCode: game.id,
    name: game.name,
    status: game.status,
    currentQuestionIndex: game.currentQuestionIndex,
    currentQuestionStartTime: game.currentQuestionStartTime,
    questionTimeLimit: game.questionTimeLimit,
    locked: game.locked ?? false,
  };
}

/**
 * Jugador de dominio → subdocumento de `players` para `$push` (`addPlayer`).
 *
 * Sella `gameId` con el id de la partida (el `gameCode` es la fuente de verdad,
 * igual que hace `toDomain`); `answers` sale como objeto plano y `avatar` es
 * opcional. `joinedAt` se preserva tal cual. US-20: `answerTimesMs` se
 * materializa como `{}` en el alta nueva (el resto de las escrituras van por
 * `updatePlayers`).
 */
export function toPersistencePlayer(player: Player, gameId: string): PersistedPlayer {
  return {
    id: player.id,
    name: player.name,
    gameId,
    answers: numberMapToRecord(player.answers),
    answerTimesMs: numberMapToRecord(player.answerTimesMs ?? {}),
    score: player.score,
    joinedAt: player.joinedAt,
    avatar: player.avatar,
  };
}
