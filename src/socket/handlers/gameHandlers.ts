// src/socket/handlers/gameHandlers.ts
import type { Socket } from "socket.io";
import type { SocketEvents } from "../../types/types.js";
import type { GameDoc } from "../../types/db.js";
import { gameStore } from "../../gameStore.js";
import { emitDashboard, emitGameUpdate, buildGame } from "../helpers.js";
import { Game as GameModel } from "../../models/Game.js";

const activeQuestionTimeouts = new Map<string, NodeJS.Timeout>();

/** Inicia el timeout de la pregunta actual */
function startQuestionTimeout(io: any, gameId: string, timeLimit: number) {
  if (activeQuestionTimeouts.has(gameId)) {
    clearTimeout(activeQuestionTimeouts.get(gameId)!);
  }

  const timeout = setTimeout(() => {
    const game = gameStore.getGame(gameId);
    if (!game || game.status !== "active") return;

    console.log("[gameHandlers] question timeout fired for game:", gameId);

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

    emitGameUpdate(io, gameId).catch((err: any) =>
      console.error("[gameHandlers] emitGameUpdate error:", err)
    );
  }, timeLimit);

  activeQuestionTimeouts.set(gameId, timeout);
}

/** Calcula milisegundos restantes de la pregunta actual (MS) */
const calcTimeLeftMs = (game: {
  currentQuestionStartTime: number;
  questionTimeLimit: number;
}) => {
  const elapsed = Date.now() - game.currentQuestionStartTime;
  const remainingMs = game.questionTimeLimit - elapsed;
  return Math.max(0, remainingMs);
};

export default function registerGameHandlers(
  io: any,
  socket: Socket<SocketEvents, SocketEvents>
) {
  /** Inicia el juego */
  socket.on("start-game", async ({ gameId }) => {
    console.log(
      "[gameHandlers] start-game received for",
      gameId,
      "from",
      socket.id
    );
    const started = gameStore.startGame(gameId);
    if (!started) {
      console.warn("[gameHandlers] startGame returned false for", gameId);
      return;
    }

    const game = gameStore.getGame(gameId)!;
    startQuestionTimeout(io, gameId, game.questionTimeLimit);

    try {
      await emitDashboard(io);
      await emitGameUpdate(io, gameId);
      console.log(
        "[gameHandlers] dashboard + gameUpdate emitted after start-game",
        gameId
      );
    } catch (err) {
      console.error("[gameHandlers] emitDashboard/emitGameUpdate error:", err);
    }

    const currentQuestion = game.questions[game.currentQuestionIndex];
    if (currentQuestion) {
      io.to(`game-${gameId}-players`).emit("game-started", {
        game,
        players: game.players,
        currentQuestion,
        results: gameStore.getGameResults(gameId) || undefined,
        timeLeft: calcTimeLeftMs(game), // ms
      });
      console.log("[gameHandlers] game-started emitted to players for", gameId);
    }
  });

  /** Avanza a la siguiente pregunta */
  socket.on("next-question", async ({ gameId }) => {
    console.log("[gameHandlers] next-question for", gameId, "from", socket.id);
    if (activeQuestionTimeouts.has(gameId)) {
      clearTimeout(activeQuestionTimeouts.get(gameId)!);
      activeQuestionTimeouts.delete(gameId);
      console.log("[gameHandlers] cleared active question timeout for", gameId);
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
      console.log("[gameHandlers] game finished emitted for", gameId);
    } else {
      const nextQuestion = nextGame.questions[nextGame.currentQuestionIndex];
      startQuestionTimeout(io, gameId, nextGame.questionTimeLimit);

      io.to(`game-${gameId}-players`).emit("question-changed", {
        question: nextQuestion,
        questionIndex: nextGame.currentQuestionIndex,
        timeLeft: calcTimeLeftMs(nextGame),
      });
      console.log(
        "[gameHandlers] question-changed emitted for",
        gameId,
        "index:",
        nextGame.currentQuestionIndex
      );
    }

    try {
      await emitDashboard(io);
      await emitGameUpdate(io, gameId);
      console.log(
        "[gameHandlers] emitDashboard + emitGameUpdate completed for",
        gameId
      );
    } catch (err) {
      console.error("[gameHandlers] emitDashboard/emitGameUpdate error:", err);
    }
  });

  /** Finaliza la pregunta actual manualmente */
  socket.on("finish-question", async ({ gameId }) => {
    console.log(
      "[gameHandlers] finish-question for",
      gameId,
      "from",
      socket.id
    );
    if (activeQuestionTimeouts.has(gameId)) {
      clearTimeout(activeQuestionTimeouts.get(gameId)!);
      activeQuestionTimeouts.delete(gameId);
      console.log(
        "[gameHandlers] cleared active question timeout (manual) for",
        gameId
      );
    }

    const game = gameStore.getGame(gameId);
    if (!game) {
      console.warn("[gameHandlers] finish-question: game not found", gameId);
      return;
    }

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
    console.log(
      "[gameHandlers] question-finished + question-results emitted for",
      gameId
    );

    try {
      await emitGameUpdate(io, gameId);
      console.log(
        "[gameHandlers] emitGameUpdate completed after finish-question for",
        gameId
      );
    } catch (err) {
      console.error("[gameHandlers] emitGameUpdate error:", err);
    }
  });

  /** Finaliza el juego */
  socket.on("finish-game", async ({ gameId }) => {
    console.log("[gameHandlers] finish-game for", gameId, "from", socket.id);
    if (activeQuestionTimeouts.has(gameId)) {
      clearTimeout(activeQuestionTimeouts.get(gameId)!);
      activeQuestionTimeouts.delete(gameId);
      console.log(
        "[gameHandlers] cleared active question timeout (finish-game) for",
        gameId
      );
    }

    const finished = gameStore.finishGame(gameId);
    if (!finished) {
      console.warn("[gameHandlers] finishGame returned false for", gameId);
      return;
    }

    const results = gameStore.getGameResults(gameId);

    io.to(`game-${gameId}-players`).emit("game-finished", {
      results: results!,
    });
    io.to(`game-${gameId}-admins`).emit("game-finished", { results: results! });
    console.log("[gameHandlers] game-finished emitted for", gameId);

    try {
      await emitDashboard(io);
      await emitGameUpdate(io, gameId);
      console.log(
        "[gameHandlers] emitDashboard + emitGameUpdate completed after finish-game for",
        gameId
      );
    } catch (err) {
      console.error("[gameHandlers] emitDashboard/emitGameUpdate error:", err);
    }
  });

  /** Solicitud de estado del juego (para reconexión o recarga) */
  socket.on("request-game-state", async ({ gameId }) => {
    console.log(
      "[gameHandlers] request-game-state received from",
      socket.id,
      "gameId:",
      gameId
    );

    // Intentamos obtener desde memoria
    let game = gameStore.getGame(gameId);
    console.log(
      "[gameHandlers] gameStore.getGame ->",
      game ? "FOUND" : "NOT FOUND",
      game ? ` (id=${game.id}, status=${game.status})` : ""
    );

    if (!game) {
      console.log(
        "[gameHandlers] game not in memory, trying to load from DB:",
        gameId
      );
      try {
        const doc = await GameModel.findById(gameId).lean<GameDoc | null>();
        console.log(
          "[gameHandlers] GameModel.findById result type:",
          Array.isArray(doc) ? "array" : typeof doc,
          doc ? "_id=" + (doc as any)._id : "null/undefined"
        );

        if (!doc) {
          console.log("[gameHandlers] game NOT found in DB for id:", gameId);
          return;
        }

        // Log parcial del doc (sin volcar todo si es grande)
        try {
          console.log("[gameHandlers] db doc summary:", {
            _id: (doc as any)._id,
            name: (doc as any).name,
            status: (doc as any).status,
            questionsCount: Array.isArray((doc as any).questions)
              ? (doc as any).questions.length
              : 0,
            playersCount: Array.isArray((doc as any).players)
              ? (doc as any).players.length
              : 0,
            createdAt: (doc as any).createdAt,
          });
        } catch (err) {
          console.warn("[gameHandlers] failed to summarize DB doc:", err);
        }

        // buildGame espera GameDoc, ahora doc tiene el tipo correcto
        const built = await buildGame(doc);
        console.log("[gameHandlers] buildGame returned:", !!built);

        if (built) {
          // Log resumen del objeto construido antes de registrarlo
          try {
            console.log("[gameHandlers] built game summary:", {
              id: built.id,
              name: built.name,
              status: built.status,
              questionsCount: built.questions?.length,
              playersCount: built.players?.length,
              currentQuestionIndex: built.currentQuestionIndex,
              currentQuestionStartTime: built.currentQuestionStartTime,
              questionTimeLimit: built.questionTimeLimit,
            });
          } catch (err) {
            console.warn("[gameHandlers] failed to summarize built game:", err);
          }

          if (typeof (gameStore as any).addGameFromDb === "function") {
            (gameStore as any).addGameFromDb(built);
            console.log(
              "[gameHandlers] added game to memory from DB:",
              gameId,
              "(via addGameFromDb)"
            );
          } else {
            console.warn("[gameHandlers] addGameFromDb not found on gameStore");
          }

          game = built;
        } else {
          console.warn("[gameHandlers] buildGame returned falsy for", gameId);
        }
      } catch (err) {
        console.error("[gameHandlers] error loading game from DB:", err);
        return;
      }
    }

    if (!game) {
      console.log(
        "[gameHandlers] still no game after DB attempt, aborting emit - gameId:",
        gameId
      );
      return;
    }

    // Preparar la respuesta
    const currentQuestion = game.questions[game.currentQuestionIndex] || null;

    // Calcular timeLeft en ms y segundos para debug
    const timeLeftMs = game.currentQuestionStartTime
      ? Math.max(
          0,
          game.questionTimeLimit - (Date.now() - game.currentQuestionStartTime)
        )
      : game.questionTimeLimit;
    const timeLeftSec = (timeLeftMs / 1000).toFixed(2);

    console.log("[gameHandlers] preparing game-state for emit:", {
      gameId: game.id,
      currentQuestionIndex: game.currentQuestionIndex,
      hasCurrentQuestion: !!currentQuestion,
      playersCount: game.players?.length ?? 0,
      timeLeftMs,
      timeLeftSec,
    });

    // Enviar Game completo + estado dinámico (timeLeft en MS)
    try {
      socket.emit("game-state", {
        game,
        currentQuestion,
        currentQuestionIndex: game.currentQuestionIndex,
        timeLeft: timeLeftMs,
      });
      console.log(
        "[gameHandlers] emitted game-state to",
        socket.id,
        "for gameId:",
        gameId
      );
    } catch (err) {
      console.error("[gameHandlers] socket.emit('game-state') failed:", err);
    }

    // Emitir actualización general y log
    try {
      await emitGameUpdate(io, gameId);
      console.log("[gameHandlers] emitGameUpdate completed for", gameId);
    } catch (err) {
      console.error("[gameHandlers] emitGameUpdate failed:", err);
    }
  });
}
