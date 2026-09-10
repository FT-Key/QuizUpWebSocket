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

export async function onLeaveGame(
  io: Server<SocketEvents, SocketEvents>,
  socket: Socket<SocketEvents, SocketEvents>,
  { gameId, playerId }: { gameId: string; playerId: string }
): Promise<void> {
  console.log("[playerHandlers] onLeaveGame", { gameId, playerId });

  await GameModel.findOneAndUpdate(
    { gameCode: gameId },
    { $pull: { players: { id: playerId } } }
  );

  gameStore.removePlayer(gameId, playerId);

  const storeGame = gameStore.getGame(gameId);

  socket.leave(`game-${gameId}`);

  if (storeGame) {
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

  let gameDoc = await GameModel.findOne({ gameCode: gameId });
  if (!gameDoc) {
    socket.emit("join-error", { message: "Game not found" });
    throw new Error("Game not found");
  }

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
    const dbPlayer = (gameDoc.players as any[]).find((p: any) => p.id === playerId);
    if (dbPlayer) {
      const plainAnswers: Record<string, number> = {};
      if (dbPlayer.answers instanceof Map) {
        for (const [k, v] of dbPlayer.answers) plainAnswers[k] = v;
      } else if (dbPlayer.answers && typeof dbPlayer.answers === "object") {
        Object.assign(plainAnswers, dbPlayer.answers);
      }
      player = {
        id: dbPlayer.id,
        name: dbPlayer.name,
        gameId,
        answers: plainAnswers,
        score: dbPlayer.score || 0,
        joinedAt: dbPlayer.joinedAt,
      };
    }
  }

  if (!player) {
    socket.emit("join-error", { message: "Invalid join data" });
    throw new Error("Invalid join data");
  }

  const playersInDb = gameDoc.players as Player[];
  if (!playersInDb.find((p) => p.id === player.id)) {
    playersInDb.push(player);
    gameDoc.players = playersInDb;
    await gameDoc.save();
  }

  let storeGame = gameStore.getGame(gameId);
  if (!storeGame) {
    const questions = (gameDoc.questions || []).map((q: any) => ({
      id: q._id?.toString() || "",
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
    }));

    const plainPlayers: Player[] = playersInDb.map((p: any) => {
      const plainAnswers: Record<string, number> = {};
      if (p.answers instanceof Map) {
        for (const [k, v] of p.answers) plainAnswers[k] = v;
      } else if (p.answers && typeof p.answers === "object") {
        Object.assign(plainAnswers, p.answers);
      }
      return { id: p.id, name: p.name, gameId, answers: plainAnswers, score: p.score || 0, joinedAt: p.joinedAt };
    });

    const newGame: Game = {
      id: gameDoc.gameCode,
      name: gameDoc.name,
      questions,
      creatorId: gameDoc.creatorId,
      status: gameDoc.status,
      currentQuestionIndex: gameDoc.currentQuestionIndex,
      currentQuestionStartTime: gameDoc.currentQuestionStartTime || 0,
      questionTimeLimit: gameDoc.questionTimeLimit || 30000,
      createdAt: gameDoc.createdAt,
      players: plainPlayers,
    };

    gameStore.addGameFromDb(newGame);
    storeGame = newGame;
  } else {
    if (!storeGame.players.find((p) => p.id === player!.id)) {
      storeGame.players.push(player);
    }
  }

  socket.join(`game-${gameId}`);

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

  socket.emit("joined", {
    player,
    game: storeGame,
  });

  io.to(`game-${gameId}-admins`).emit("player-joined", {
    player,
    game: storeGame,
  });

  await emitGameUpdate(io, gameId);
  await emitDashboard(io);

  console.log("[playerHandlers] player joined successfully:", player.id);
  return { player, game: storeGame };
}
