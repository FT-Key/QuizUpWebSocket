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
  console.log("[playerHandlers] onJoinGame called by", socket.id, "payload:", {
    gameId,
    playerId,
    playerName,
  });

  // Buscar juego en DB
  const gameDoc = await GameModel.findById(gameId);
  if (!gameDoc) {
    socket.emit("join-error", { message: "Game not found" });
    return;
  }

  let player: Player | undefined;

  if (!playerId && playerName) {
    // Crear nuevo jugador
    player = {
      id: crypto.randomUUID(),
      name: playerName,
      gameId,
      answers: {},
      score: 0,
      joinedAt: new Date(),
    };
  } else if (playerId) {
    // Re-join usando playerId
    player = (gameDoc.players as Player[]).find((p) => p.id === playerId);
  }

  if (!player) {
    socket.emit("join-error", { message: "Invalid join data" });
    return;
  }

  // 1️⃣ Guardar jugador si no existía
  const players = gameDoc.players as Player[];
  const alreadyInGame = players.find((p) => p.id === player!.id);
  if (!alreadyInGame) {
    players.push(player);
    try {
      await gameDoc.save();
    } catch (err) {
      socket.emit("join-error", { message: "Failed to save player" });
      return;
    }
  }

  // 2️⃣ Mapear juego para frontend
  const gameForClient = {
    id: gameDoc._id.toString(),
    name: gameDoc.name,
    questions: (gameDoc.questions || []).map((q: any) => ({
      id: q._id?.toString() || "",
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
    })),
    creatorId: gameDoc.creatorId,
    status: gameDoc.status,
    currentQuestionIndex: gameDoc.currentQuestionIndex,
    currentQuestionStartTime: gameDoc.currentQuestionStartTime || 0,
    questionTimeLimit: gameDoc.questionTimeLimit || 30000,
    createdAt: gameDoc.createdAt,
    players: (gameDoc.players || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      gameId: p.gameId,
      answers: p.answers || {},
      score: p.score || 0,
      joinedAt: p.joinedAt,
    })),
  };

  // 3️⃣ Unir socket a la sala de players
  socket.join(`game-${gameId}-players`);

  // 4️⃣ Emitir a admins que hay un nuevo jugador
  io.to(`game-${gameId}-admins`).emit("player-joined", {
    player,
    game: gameForClient,
  });

  // 5️⃣ Emitir al jugador que se unió
  socket.emit("joined", { player, game: gameForClient });

  // 6️⃣ Actualizar todos los clientes
  await emitGameUpdate(io, gameId);
  await emitDashboard(io);
}
