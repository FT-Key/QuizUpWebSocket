import { Game as GameModel } from "../models/Game.js";
import type { GameDoc } from "../types/db.js";
import { toDomain } from "../adapters/persistence/mongo/game.mapper.js";

export async function emitGameUpdate(io: any, gameId: string) {
  const doc = await GameModel.findOne({ gameCode: gameId }).lean<GameDoc>();
  if (!doc) return;

  const game = toDomain(doc);

  io.to(`game-${gameId}-admins`).emit("game-updated", { game });
  io.to(`game-${gameId}`).emit("game-updated", { game });
}

export async function emitDashboard(io: any) {
  const docs = await GameModel.find().sort({ createdAt: -1 }).lean<GameDoc[]>();
  const games = docs.map(toDomain);
  io.emit("update-dashboard", games);
}
