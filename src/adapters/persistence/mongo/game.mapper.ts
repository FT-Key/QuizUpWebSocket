import type { Game, GameStatus } from "../../../core/domain/game.js";
import type { GameDoc } from "../../../types/db.js";
import { DEFAULT_TIME_LIMIT_MS } from "../../../constants/game.js";

/**
 * Conversión doc ↔ dominio del agregado Game (US-05).
 *
 * Única implementación de la conversión `answers` Map/objeto del repo.
 * `toDomain` es la migración 1:1 del `buildGame` legacy (`socket/helpers.ts`).
 */

/** Jugador tal como se persiste en Mongo (answers como objeto; Mongoose lo castea a Map). */
export interface PersistedPlayer {
  id: string;
  name: string;
  gameId: string;
  answers: Record<string, number>;
  score: number;
  joinedAt: Date;
  avatar?: { seed: string; accessories?: string[] };
}

/** Campos mutables del agregado que `save` persiste (questions/createdAt/creatorId son inmutables). */
export interface GamePersistence {
  gameCode: string;
  name: string;
  status: GameStatus;
  currentQuestionIndex: number;
  currentQuestionStartTime: number;
  questionTimeLimit: number;
  locked: boolean;
  players: PersistedPlayer[];
}

/**
 * Convierte `answers` (Map del driver, objeto plano de `.lean()` u otro valor
 * inesperado) a `Record<string, number>`. Tolerante a propósito: el legacy
 * recibía ambas representaciones según la ruta de lectura.
 */
export function answersToRecord(answers: unknown): Record<string, number> {
  if (answers instanceof Map) {
    return Object.fromEntries(answers as Map<string, number>);
  }
  if (answers && typeof answers === "object") {
    return { ...(answers as Record<string, number>) };
  }
  return {};
}

/** doc Mongo → dominio. Equivalente exacto al `buildGame` legacy (helpers.ts:6-47). */
export function toDomain(doc: GameDoc): Game {
  return {
    id: doc.gameCode,
    name: doc.name,
    status: doc.status,
    questions: (doc.questions || []).map((q) => ({
      id: q._id ? String(q._id) : "",
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
      image: q.image ?? null,
    })),
    players: (doc.players || []).map((p) => ({
      id: p.id,
      name: p.name,
      gameId: doc.gameCode,
      answers: answersToRecord(p.answers),
      score: p.score,
      joinedAt: p.joinedAt,
      avatar: p.avatar ?? undefined,
    })),
    createdAt: doc.createdAt,
    creatorId: doc.creatorId,
    currentQuestionIndex: doc.currentQuestionIndex,
    currentQuestionStartTime: doc.currentQuestionStartTime ?? 0,
    questionTimeLimit: doc.questionTimeLimit || DEFAULT_TIME_LIMIT_MS,
    locked: doc.locked ?? false,
  };
}

/**
 * Agregado → campos persistibles de `save` (sin questions/_id/createdAt/creatorId).
 *
 * No incluye `questions` ni `createdAt` ni `creatorId`: durante la partida no
 * cambian y sus `_id`/fechas no deben reescribirse. `answers` sale como objeto
 * plano (mismo shape que el `$set` del `bulkWrite` legacy); Mongoose lo castea
 * a Map al escribir. `players[].gameId` se sella con `game.id` (el `gameCode`
 * es la fuente de verdad, igual que hace `toDomain`).
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
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      gameId: game.id,
      answers: answersToRecord(p.answers),
      score: p.score,
      joinedAt: p.joinedAt,
      avatar: p.avatar,
    })),
  };
}
