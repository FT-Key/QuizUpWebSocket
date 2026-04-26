// src/socket/handlers/gameHandlers.ts
import type { Socket } from "socket.io";
import type { SocketEvents } from "../../types/types.js";
import type { GameDoc } from "../../types/db.js";
import { gameStore } from "../../gameStore.js";
import { emitDashboard, emitGameUpdate, buildGame } from "../helpers.js";
import { Game as GameModel } from "../../models/Game.js";

const activeQuestionTimeouts = new Map<string, NodeJS.Timeout>();

function startQuestionTimeout(io: any, gameId: string, timeLimit: number) {
  if (activeQuestionTimeouts.has(gameId)) {
    clearTimeout(activeQuestionTimeouts.get(gameId)!);
    activeQuestionTimeouts.delete(gameId);
  }

  console.log(`[gameHandlers] starting ${timeLimit}ms timeout for game ${gameId}`);

  const timeout = setTimeout(() => {
    const game = gameStore.getGame(gameId);
    if (!game || game.status !== "active") {
      console.log(`[gameHandlers] timeout fired but game not active, skipping`);
      return;
    }

    console.log(`[gameHandlers] timeout fired for game ${gameId}, q index ${game.currentQuestionIndex}`);
    gameStore.finishCurrentQuestion(gameId);

    io.to(`game-${gameId}`).emit("question-finished", { currentQuestionIndex: game.currentQuestionIndex });
    io.to(`game-${gameId}-admins`).emit("question-finished", { currentQuestionIndex: game.currentQuestionIndex });
    console.log(`[gameHandlers] question-finished emitted for game ${gameId}`);
  }, timeLimit);

  activeQuestionTimeouts.set(gameId, timeout);
}

function clearQuestionTimeout(gameId: string) {
  if (activeQuestionTimeouts.has(gameId)) {
    clearTimeout(activeQuestionTimeouts.get(gameId)!);
    activeQuestionTimeouts.delete(gameId);
    console.log(`[gameHandlers] cleared timeout for game ${gameId}`);
  }
}

const calcTimeLeftMs = (startTime: number, timeLimit: number) =>
  Math.max(0, timeLimit - (Date.now() - startTime));

export default function registerGameHandlers(io: any, socket: Socket<SocketEvents, SocketEvents>) {

  socket.on("start-game", async ({ gameId }) => {
    console.log(`[gameHandlers] start-game for ${gameId} from ${socket.id}`);
    const started = gameStore.startGame(gameId);
    if (!started) { console.warn(`[gameHandlers] startGame failed for ${gameId}`); return; }

    const game = gameStore.getGame(gameId)!;
    startQuestionTimeout(io, gameId, game.questionTimeLimit);

    const payload = {
      game,
      currentQuestion: game.questions[game.currentQuestionIndex],
      timeLeft: calcTimeLeftMs(game.currentQuestionStartTime, game.questionTimeLimit),
    };
    io.to(`game-${gameId}`).emit("game-started", payload);
    io.to(`game-${gameId}-admins`).emit("game-started", payload);
    console.log(`[gameHandlers] game-started emitted, timeLeft=${payload.timeLeft}ms`);

    await emitDashboard(io).catch(console.error);
  });

  socket.on("next-question", async ({ gameId }) => {
    console.log(`[gameHandlers] next-question for ${gameId} from ${socket.id}`);
    clearQuestionTimeout(gameId);

    const advanced = gameStore.nextQuestion(gameId);
    const game = gameStore.getGame(gameId)!;

    console.log(`[gameHandlers] nextQuestion result: advanced=${advanced}, status=${game.status}, index=${game.currentQuestionIndex}`);

    if (game.status === "finished") {
      const results = gameStore.getGameResults(gameId);
      io.to(`game-${gameId}`).emit("game-finished", { results });
      io.to(`game-${gameId}-admins`).emit("game-finished", { results });
      console.log(`[gameHandlers] game-finished emitted for ${gameId}`);
    } else {
      const nextQuestion = game.questions[game.currentQuestionIndex];
      startQuestionTimeout(io, gameId, game.questionTimeLimit);

      const payload = {
        question: nextQuestion,
        questionIndex: game.currentQuestionIndex,
        timeLeft: calcTimeLeftMs(game.currentQuestionStartTime, game.questionTimeLimit),
      };
      io.to(`game-${gameId}`).emit("question-changed", payload);
      io.to(`game-${gameId}-admins`).emit("question-changed", payload);
      console.log(`[gameHandlers] question-changed emitted, index=${game.currentQuestionIndex}, timeLeft=${payload.timeLeft}ms`);
    }

    await emitDashboard(io).catch(console.error);
    // NO llamar emitGameUpdate aquí — causaría que game-updated sobreescriba currentQuestionIndex con el valor viejo de DB
  });

  socket.on("finish-game", async ({ gameId }) => {
    console.log(`[gameHandlers] finish-game for ${gameId} from ${socket.id}`);
    clearQuestionTimeout(gameId);

    const finished = gameStore.finishGame(gameId);
    if (!finished) { console.warn(`[gameHandlers] finishGame failed for ${gameId}`); return; }

    const results = gameStore.getGameResults(gameId);
    io.to(`game-${gameId}`).emit("game-finished", { results });
    io.to(`game-${gameId}-admins`).emit("game-finished", { results });
    console.log(`[gameHandlers] game-finished emitted for ${gameId}`);

    await emitDashboard(io).catch(console.error);
  });

  socket.on("request-game-state", async ({ gameId }) => {
    console.log(`[gameHandlers] request-game-state from ${socket.id} for ${gameId}`);

    let game = gameStore.getGame(gameId);

    if (!game) {
      try {
        const doc = await GameModel.findById(gameId).lean<GameDoc | null>();
        if (!doc) { console.log(`[gameHandlers] game not found in DB: ${gameId}`); return; }
        const built = await buildGame(doc);
        gameStore.addGameFromDb(built);
        game = built;
        console.log(`[gameHandlers] loaded game from DB: ${gameId}`);
      } catch (err) {
        console.error(`[gameHandlers] error loading game from DB:`, err);
        return;
      }
    }

    if (!game) return;

    const timeLeftMs = game.currentQuestionStartTime > 0
      ? calcTimeLeftMs(game.currentQuestionStartTime, game.questionTimeLimit)
      : 0;

    socket.emit("game-state", {
      game,
      currentQuestion: game.questions[game.currentQuestionIndex] ?? null,
      currentQuestionIndex: game.currentQuestionIndex,
      timeLeft: timeLeftMs,
    });
    console.log(`[gameHandlers] game-state emitted to ${socket.id}, status=${game.status}, timeLeft=${timeLeftMs}ms`);
  });
}
