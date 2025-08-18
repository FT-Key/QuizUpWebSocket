// src/socket/handlers/playerHandlers.ts
import crypto from "crypto";
import { Game as GameModel } from "../../models/Game.js";
import { emitDashboard, emitGameUpdate } from "../helpers.js";
import type { Player } from "../../types/types.js";

export default async function onJoinGame(
  io: any,
  socket: any,
  {
    gameId,
    playerId,
    playerName,
  }: { gameId: string; playerId?: string; playerName?: string }
) {
  const game = await GameModel.findById(gameId);
  if (!game) return;

  let player: Player | undefined;

  if (!playerId && playerName) {
    // crear nuevo
    player = {
      id: crypto.randomUUID(),
      name: playerName,
      gameId,
      answers: {},
      score: 0,
      joinedAt: new Date(),
    };
  } else if (playerId) {
    // re-join
    player = (game.players as Player[]).find((p) => p.id === playerId);
  }

  if (player) {
    const players = game.players as Player[];
    if (!players.find((p) => p.id === player.id)) {
      players.push(player);
      await game.save();
    }

    io.to(`game-${gameId}-admins`).emit("player-joined", { player });
  }

  socket.join(`game-${gameId}-players`);
  await emitGameUpdate(io, gameId);
  await emitDashboard(io);
}
