// src/socket/helpers.ts
import { Game as GameModel } from "../models/Game.js";
import type { Game as GameType, Question, Player } from "../types/types.js";
import type { GameDoc } from "../types/db.js";
import { DEFAULT_TIME_LIMIT_MS } from "../constants/game.js";

export async function buildGame(gameDoc: GameDoc): Promise<GameType> {
  return {
    id: gameDoc._id.toString(),
    name: gameDoc.name,
    status: gameDoc.status as GameType["status"],
    questions: (gameDoc.questions || []).map(
      (q): Question => ({
        id: q._id?.toString() || "",
        text: q.text,
        options: q.options as [string, string, string, string],
        correctAnswer: q.correctAnswer,
      })
    ),
    players: (gameDoc.players || []).map(
      (p): Player => ({
        id: p.id,
        name: p.name,
        gameId: gameDoc._id.toString(),
        answers: p.answers,
        score: p.score,
        joinedAt: p.joinedAt,
      })
    ),
    createdAt: gameDoc.createdAt,
    creatorId: gameDoc.creatorId,
    currentQuestionIndex: gameDoc.currentQuestionIndex,
    currentQuestionStartTime: gameDoc.currentQuestionStartTime ?? 0,
    questionTimeLimit: gameDoc.questionTimeLimit || DEFAULT_TIME_LIMIT_MS,
  };
}

export async function emitGameUpdate(io: any, gameId: string) {
  const doc = await GameModel.findById(gameId).lean<GameDoc>();
  if (!doc) return;

  const game = await buildGame(doc);

  io.to(`game-${gameId}-admins`).emit("game-updated", { game });
  io.to(`game-${gameId}`).emit("game-updated", { game });
}

export async function emitDashboard(io: any) {
  const docs = await GameModel.find().sort({ createdAt: -1 }).lean<GameDoc[]>();
  const games = await Promise.all(docs.map(buildGame));
  io.emit("update-dashboard", games);
}
