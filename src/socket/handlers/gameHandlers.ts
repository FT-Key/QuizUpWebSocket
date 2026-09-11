import type { Socket } from "socket.io";
import type { SocketEvents } from "../../types/types.js";
import type { GameDoc } from "../../types/db.js";
import { gameStore } from "../../gameStore.js";
import { emitDashboard, emitGameUpdate, buildGame } from "../helpers.js";
import { Game as GameModel } from "../../models/Game.js";
import { isWaitingGameExpired } from "../../cleanupStaleGames.js";

const activeQuestionTimeouts = new Map<string, NodeJS.Timeout>();

function startQuestionTimeout(io: any, gameId: string, timeLimit: number) {
  if (activeQuestionTimeouts.has(gameId)) {
    clearTimeout(activeQuestionTimeouts.get(gameId)!);
    activeQuestionTimeouts.delete(gameId);
  }

  const timeout = setTimeout(async () => {
    const game = gameStore.getGame(gameId);
    if (!game || game.status !== "active") {
      return;
    }

    if (game.currentQuestionStartTime === 0) {
      return;
    }

    gameStore.finishCurrentQuestion(gameId);

    try {
      const bulkOps = game.players.map((p: any) => {
        const answersObj: Record<string, number> = {};
        if (p.answers instanceof Map) {
          for (const [k, v] of p.answers) answersObj[k] = v;
        } else {
          Object.assign(answersObj, p.answers);
        }
        return {
          updateOne: {
            filter: { gameCode: gameId, "players.id": p.id },
            update: { $set: { "players.$.answers": answersObj, "players.$.score": p.score } },
          },
        };
      });
      if (bulkOps.length > 0) {
        await GameModel.bulkWrite(bulkOps);
      }
    } catch (err) {
      console.error(`[gameHandlers] failed to persist answers to DB:`, err);
    }

    io.to(`game-${gameId}`).emit("question-finished", { currentQuestionIndex: game.currentQuestionIndex });
    io.to(`game-${gameId}-admins`).emit("question-finished", { currentQuestionIndex: game.currentQuestionIndex });

    io.to(`game-${gameId}`).emit("game-updated", { game });
    io.to(`game-${gameId}-admins`).emit("game-updated", { game });
  }, timeLimit);

  activeQuestionTimeouts.set(gameId, timeout);
}

function clearQuestionTimeout(gameId: string) {
  if (activeQuestionTimeouts.has(gameId)) {
    clearTimeout(activeQuestionTimeouts.get(gameId)!);
    activeQuestionTimeouts.delete(gameId);
  }
}

const calcTimeLeftMs = (startTime: number, timeLimit: number) =>
  Math.max(0, timeLimit - (Date.now() - startTime));

export default function registerGameHandlers(io: any, socket: Socket<SocketEvents, SocketEvents>) {

  socket.on("start-game", async ({ gameId }) => {
    let game = gameStore.getGame(gameId);
    if (!game) {
      try {
        const doc = await GameModel.findOne({ gameCode: gameId }).lean<GameDoc | null>();
        if (!doc) { return; }
        const built = await buildGame(doc);
        gameStore.addGameFromDb(built);
        game = built;
      } catch (err) {
        console.error(`[gameHandlers] error loading game from DB for start-game:`, err);
        return;
      }
    }

    if (game.status !== "waiting") {
      return;
    }

    const started = gameStore.startGame(gameId);
    if (!started) { return; }

    game = gameStore.getGame(gameId)!;
    startQuestionTimeout(io, gameId, game.questionTimeLimit);

    const payload = {
      game,
      currentQuestion: game.questions[game.currentQuestionIndex],
      timeLeft: calcTimeLeftMs(game.currentQuestionStartTime, game.questionTimeLimit),
    };
    io.to(`game-${gameId}`).emit("game-started", payload);
    io.to(`game-${gameId}-admins`).emit("game-started", payload);

    await emitDashboard(io).catch(console.error);
  });

  socket.on("next-question", async ({ gameId }) => {
    clearQuestionTimeout(gameId);

    gameStore.nextQuestion(gameId);
    const game = gameStore.getGame(gameId)!;

    try {
      const bulkOps = game.players.map((p: any) => {
        const answersObj: Record<string, number> = {};
        if (p.answers instanceof Map) {
          for (const [k, v] of p.answers) answersObj[k] = v;
        } else {
          Object.assign(answersObj, p.answers);
        }
        return {
          updateOne: {
            filter: { gameCode: gameId, "players.id": p.id },
            update: { $set: { "players.$.answers": answersObj, "players.$.score": p.score } },
          },
        };
      });
      if (bulkOps.length > 0) {
        await GameModel.bulkWrite(bulkOps);
      }
    } catch (err) {
      console.error(`[gameHandlers] failed to persist answers before next question:`, err);
    }

    if (game.status === "finished") {
      const results = gameStore.getGameResults(gameId);
      io.to(`game-${gameId}`).emit("game-finished", { game, results });
      io.to(`game-${gameId}-admins`).emit("game-finished", { game, results });
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
    }

    await emitDashboard(io).catch(console.error);
  });

  socket.on("finish-game", async ({ gameId }) => {
    clearQuestionTimeout(gameId);

    const finished = gameStore.finishGame(gameId);
    if (!finished) { return; }

    const gameBefore = gameStore.getGame(gameId);

    try {
      if (gameBefore) {
        const bulkOps = gameBefore.players.map((p: any) => {
          const answersObj: Record<string, number> = {};
          if (p.answers instanceof Map) {
            for (const [k, v] of p.answers) answersObj[k] = v;
          } else {
            Object.assign(answersObj, p.answers);
          }
          return {
            updateOne: {
              filter: { gameCode: gameId, "players.id": p.id },
              update: { $set: { "players.$.answers": answersObj, "players.$.score": p.score } },
            },
          };
        });
        if (bulkOps.length > 0) {
          await GameModel.bulkWrite(bulkOps);
        }
      }
      await GameModel.findOneAndUpdate({ gameCode: gameId }, { status: "finished" });
    } catch (err) {
      console.error(`[gameHandlers] failed to persist finish-game to DB:`, err);
    }

    const game = gameStore.getGame(gameId);
    const results = gameStore.getGameResults(gameId);

    io.to(`game-${gameId}`).emit("game-finished", { game, results });
    io.to(`game-${gameId}-admins`).emit("game-finished", { game, results });

    await emitDashboard(io).catch(console.error);
  });

  socket.on("request-game-state", async ({ gameId }) => {
    let game = gameStore.getGame(gameId);

    if (!game) {
      try {
        const doc = await GameModel.findOne({ gameCode: gameId }).lean<GameDoc | null>();
        if (!doc) { return; }
        const built = await buildGame(doc);
        gameStore.addGameFromDb(built);
        game = built;
      } catch (err) {
        console.error(`[gameHandlers] error loading game from DB:`, err);
        return;
      }
    }

    if (!game) return;

    if (game.status === "waiting" && isWaitingGameExpired(game.createdAt)) {
      try {
        await GameModel.findOneAndUpdate(
          { gameCode: gameId, status: "waiting" },
          { status: "cancelled" }
        );
      } catch (err) {
        console.error(
          `[gameHandlers] no se pudo cancelar la partida expirada ${gameId}:`,
          err
        );
      }
      gameStore.cancelGame(gameId);
      game = gameStore.getGame(gameId)!;
      io.to(`game-${gameId}`).emit("game-cancelled", { game });
      io.to(`game-${gameId}-admins`).emit("game-cancelled", { game });
    }

    const timeLeftMs = game.currentQuestionStartTime > 0
      ? calcTimeLeftMs(game.currentQuestionStartTime, game.questionTimeLimit)
      : 0;

    socket.emit("game-state", {
      game,
      currentQuestion: game.questions[game.currentQuestionIndex] ?? null,
      currentQuestionIndex: game.currentQuestionIndex,
      timeLeft: timeLeftMs,
    });
  });
}
