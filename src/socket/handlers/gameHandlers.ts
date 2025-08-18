// src/socket/handlers/gameHandlers.ts
import type { Socket } from "socket.io";
import type { SocketEvents } from "../../types/types.js";
import { gameStore } from "../../gameStore.js";
import { emitDashboard, emitGameUpdate } from "../helpers.js";

const activeQuestionTimeouts = new Map<string, NodeJS.Timeout>();

/** Inicia el timeout de la pregunta actual */
function startQuestionTimeout(io: any, gameId: string, timeLimit: number) {
  if (activeQuestionTimeouts.has(gameId)) {
    clearTimeout(activeQuestionTimeouts.get(gameId)!);
  }

  const timeout = setTimeout(() => {
    const game = gameStore.getGame(gameId);
    if (!game || game.status !== "active") return;

    gameStore.finishCurrentQuestion(gameId);

    io.to(`game-${gameId}-players`).emit("question-finished", {
      currentQuestionIndex: game.currentQuestionIndex,
    });

    io.to(`game-${gameId}-admins`).emit("question-finished", {
      currentQuestionIndex: game.currentQuestionIndex,
    });

    // Enviar resultados de la pregunta al admin
    const questionResults = game.players.map((p) => ({
      playerId: p.id,
      name: p.name,
      answer: p.answers[game.questions[game.currentQuestionIndex].id],
      isCorrect:
        p.answers[game.questions[game.currentQuestionIndex].id] ===
        game.questions[game.currentQuestionIndex].correctAnswer,
    }));

    io.to(`game-${gameId}-admins`).emit("question-results", {
      questionIndex: game.currentQuestionIndex,
      results: questionResults,
    });

    emitGameUpdate(io, gameId);
  }, timeLimit);

  activeQuestionTimeouts.set(gameId, timeout);
}

/** Calcula segundos restantes de la pregunta actual */
const calcTimeLeft = (game: {
  currentQuestionStartTime: number;
  questionTimeLimit: number;
}) => {
  const elapsed = Date.now() - game.currentQuestionStartTime;
  const remainingMs = game.questionTimeLimit - elapsed;
  return Math.max(0, Math.floor(remainingMs / 1000));
};

export default function registerGameHandlers(
  io: any,
  socket: Socket<SocketEvents, SocketEvents>
) {
  /** Inicia el juego */
  socket.on("start-game", async ({ gameId }) => {
    const started = gameStore.startGame(gameId);
    if (!started) return;

    const game = gameStore.getGame(gameId)!;
    startQuestionTimeout(io, gameId, game.questionTimeLimit);

    await emitDashboard(io);
    await emitGameUpdate(io, gameId);

    const currentQuestion = game.questions[game.currentQuestionIndex];
    if (currentQuestion) {
      io.to(`game-${gameId}-players`).emit("game-started", {
        game,
        players: game.players,
        currentQuestion,
        results: gameStore.getGameResults(gameId) || undefined,
        timeLeft: calcTimeLeft(game),
      });
    }
  });

  /** Avanza a la siguiente pregunta */
  socket.on("next-question", async ({ gameId }) => {
    if (activeQuestionTimeouts.has(gameId)) {
      clearTimeout(activeQuestionTimeouts.get(gameId)!);
      activeQuestionTimeouts.delete(gameId);
    }

    const hasNext = gameStore.nextQuestion(gameId);
    const nextGame = gameStore.getGame(gameId)!;

    if (nextGame.status === "finished") {
      const results = gameStore.getGameResults(gameId);
      io.to(`game-${gameId}-players`).emit("game-finished", {
        results: results!,
      });
      io.to(`game-${gameId}-admins`).emit("game-finished", {
        results: results!,
      });
    } else {
      const nextQuestion = nextGame.questions[nextGame.currentQuestionIndex];
      startQuestionTimeout(io, gameId, nextGame.questionTimeLimit);

      io.to(`game-${gameId}-players`).emit("question-changed", {
        question: nextQuestion,
        questionIndex: nextGame.currentQuestionIndex,
        timeLeft: calcTimeLeft(nextGame),
      });
    }

    await emitDashboard(io);
    await emitGameUpdate(io, gameId);
  });

  /** Finaliza la pregunta actual manualmente */
  socket.on("finish-question", async ({ gameId }) => {
    if (activeQuestionTimeouts.has(gameId)) {
      clearTimeout(activeQuestionTimeouts.get(gameId)!);
      activeQuestionTimeouts.delete(gameId);
    }

    const game = gameStore.getGame(gameId);
    if (!game) return;

    gameStore.finishCurrentQuestion(gameId);

    io.to(`game-${gameId}-players`).emit("question-finished", {
      currentQuestionIndex: game.currentQuestionIndex,
    });
    io.to(`game-${gameId}-admins`).emit("question-finished", {
      currentQuestionIndex: game.currentQuestionIndex,
    });

    // Enviar resultados de la pregunta al admin
    const questionResults = game.players.map((p) => ({
      playerId: p.id,
      name: p.name,
      answer: p.answers[game.questions[game.currentQuestionIndex].id],
      isCorrect:
        p.answers[game.questions[game.currentQuestionIndex].id] ===
        game.questions[game.currentQuestionIndex].correctAnswer,
    }));

    io.to(`game-${gameId}-admins`).emit("question-results", {
      questionIndex: game.currentQuestionIndex,
      results: questionResults,
    });

    await emitGameUpdate(io, gameId);
  });

  /** Finaliza el juego */
  socket.on("finish-game", async ({ gameId }) => {
    if (activeQuestionTimeouts.has(gameId)) {
      clearTimeout(activeQuestionTimeouts.get(gameId)!);
      activeQuestionTimeouts.delete(gameId);
    }

    const finished = gameStore.finishGame(gameId);
    if (!finished) return;

    const results = gameStore.getGameResults(gameId);

    io.to(`game-${gameId}-players`).emit("game-finished", {
      results: results!,
    });
    io.to(`game-${gameId}-admins`).emit("game-finished", { results: results! });

    await emitDashboard(io);
    await emitGameUpdate(io, gameId);
  });

  /** Solicitud de estado del juego (para reconexión o recarga) */
  socket.on("request-game-state", async ({ gameId }) => {
    const game = gameStore.getGame(gameId);
    if (!game) return;

    // Pregunta actual (o null si no hay)
    const currentQuestion = game.questions[game.currentQuestionIndex] || null;

    // Tiempo restante de la pregunta actual
    const timeLeft = game.currentQuestionStartTime
      ? Math.max(
          0,
          Math.floor(
            (game.questionTimeLimit -
              (Date.now() - game.currentQuestionStartTime)) /
              1000
          )
        )
      : 0;

    // Emitir directamente al jugador que lo solicitó
    socket.emit("game-state", {
      currentQuestion,
      currentQuestionIndex: game.currentQuestionIndex,
      status: game.status,
      timeLeft,
      players: game.players,
      results: gameStore.getGameResults(gameId) || undefined,
    });

    // Opcional: actualizar admins con el estado completo del juego
    await emitGameUpdate(io, gameId);
  });
}
