// src/socket/handlers/playerHandlers.ts
import crypto from "crypto";
import { Server, Socket } from "socket.io";
import { Game as GameModel } from "../../models/Game.js";
import { gameStore } from "../../gameStore.js";
import { emitDashboard, emitGameUpdate } from "../helpers.js";
import type { Player, Game, SocketEvents } from "../../types/types.js";

interface JoinPayload {
  gameId: string;
  playerId?: string;
  playerName?: string;
}

/**
 * Maneja la conexión de un jugador a un juego.
 * 1️⃣ Lo agrega a MongoDB si no existía
 * 2️⃣ Lo agrega o actualiza en gameStore
 * 3️⃣ Emite eventos a admins y al jugador
 */
export async function onLeaveGame(
  io: Server<SocketEvents, SocketEvents>,
  socket: Socket<SocketEvents, SocketEvents>,
  { gameId, playerId }: { gameId: string; playerId: string }
): Promise<void> {
  console.log("[playerHandlers] onLeaveGame", { gameId, playerId });

  // Eliminar de DB
  await GameModel.findByIdAndUpdate(gameId, {
    $pull: { players: { id: playerId } },
  });

  // Eliminar del store en memoria
  gameStore.removePlayer(gameId, playerId);

  const storeGame = gameStore.getGame(gameId);

  // Sacar al socket de la sala
  socket.leave(`game-${gameId}`);

  if (storeGame) {
    // Notificar a admins y demás jugadores
    io.to(`game-${gameId}-admins`).emit("player-left", { playerId, game: storeGame });
    io.to(`game-${gameId}`).emit("player-left", { playerId, game: storeGame });
  }

  await emitDashboard(io);
}

export default async function onJoinGame(
  io: Server<SocketEvents, SocketEvents>,
  socket: Socket<SocketEvents, SocketEvents>,
  { gameId, playerId, playerName }: JoinPayload
): Promise<{ player: Player; game: Game }> {
  console.log("[playerHandlers] onJoinGame called by", socket.id, {
    gameId,
    playerId,
    playerName,
  });

  // 1️⃣ Buscar juego en DB
  let gameDoc = await GameModel.findById(gameId);
  if (!gameDoc) {
    socket.emit("join-error", { message: "Game not found" });
    throw new Error("Game not found");
  }

  // 2️⃣ Crear o recuperar jugador
  let player: Player | undefined;
  if (!playerId && playerName) {
    player = {
      id: crypto.randomUUID(),
      name: playerName,
      gameId,
      answers: {},
      score: 0,
      joinedAt: new Date(),
    };
  } else if (playerId) {
    player = (gameDoc.players as Player[]).find((p) => p.id === playerId);
  }

  if (!player) {
    socket.emit("join-error", { message: "Invalid join data" });
    throw new Error("Invalid join data");
  }

  // 3️⃣ Guardar jugador en DB si no existía
  const playersInDb = gameDoc.players as Player[];
  if (!playersInDb.find((p) => p.id === player.id)) {
    playersInDb.push(player);
    gameDoc.players = playersInDb;
    await gameDoc.save();
  }

  // 4️⃣ Agregar o actualizar jugador en gameStore
  let storeGame = gameStore.getGame(gameId);
  if (!storeGame) {
    // Si el juego no está en memoria, lo agregamos
    const questions = (gameDoc.questions || []).map((q: any) => ({
      id: q._id?.toString() || "",
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
    }));

    const newGame: Game = {
      id: gameDoc._id.toString(),
      name: gameDoc.name,
      questions,
      creatorId: gameDoc.creatorId,
      status: gameDoc.status,
      currentQuestionIndex: gameDoc.currentQuestionIndex,
      currentQuestionStartTime: gameDoc.currentQuestionStartTime || 0,
      questionTimeLimit: gameDoc.questionTimeLimit || 30000,
      createdAt: gameDoc.createdAt,
      players: [...playersInDb],
    };

    gameStore.addGameFromDb(newGame);
    storeGame = newGame;
  } else {
    // Actualizar jugadores en memoria
    if (!storeGame.players.find((p) => p.id === player!.id)) {
      storeGame.players.push(player);
    }
  }

  // 5️⃣ Unir socket a la sala general de jugadores
  socket.join(`game-${gameId}`);

  // 6️⃣ Emitir game-state actualizado a todos los admins
  const currentQuestion =
    storeGame.questions[storeGame.currentQuestionIndex] || null;

  io.to(`game-${gameId}-admins`).emit("game-state", {
    game: storeGame,
    currentQuestion,
    currentQuestionIndex: storeGame.currentQuestionIndex,
    timeLeft:
      storeGame.currentQuestionStartTime > 0
        ? storeGame.questionTimeLimit -
          (Date.now() - storeGame.currentQuestionStartTime)
        : storeGame.questionTimeLimit,
  });

  // 7️⃣ Emitir evento solo al jugador recién conectado
  socket.emit("joined", {
    player,
    game: storeGame,
  });

  // Notificar a admins que un jugador se unió
  io.to(`game-${gameId}-admins`).emit("player-joined", {
    player,
    game: storeGame,
  });

  // 8️⃣ Actualizar snapshot / dashboard si aplica
  await emitGameUpdate(io, gameId);
  await emitDashboard(io);

  console.log("[playerHandlers] player joined successfully:", player.id);
  return { player, game: storeGame };
}
