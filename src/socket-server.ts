// src/socket-server.ts
import dotenv from "dotenv";
import path from "path";
import { createServer } from "http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { readFile } from "fs/promises";
import connectToDB from "./mongoose.js";

import registerAdminHandlers from "./socket/handlers/adminHandlers.js";
import registerGameHandlers from "./socket/handlers/gameHandlers.js";
import onJoinGame, { onLeaveGame } from "./socket/handlers/playerHandlers.js";
import { emitDashboard } from "./socket/helpers.js";
import { gameStore } from "./gameStore.js";
import type { SocketEvents } from "./types/types.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const httpServer = createServer(async (req, res) => {
  try {
    if (req.url === "/" || req.url === "/index.html") {
      const html = await readFile(
        path.resolve(process.cwd(), "src", "index.html"),
        "utf-8"
      );
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(html);
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  } catch (err) {
    console.error("[socket-server] httpServer error:", err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

const io = new SocketIOServer<SocketEvents, SocketEvents>(httpServer, {
  cors: { origin: "*" },
});

process.on("uncaughtException", (err) =>
  console.error("[process] uncaughtException:", err)
);
process.on("unhandledRejection", (reason) =>
  console.error("[process] unhandledRejection:", reason)
);

io.on("connection", (socket: Socket<SocketEvents, SocketEvents>) => {
  console.log("[socket-server] Socket connected:", socket.id);

  // registrar handlers
  try {
    registerAdminHandlers(io, socket);
  } catch (err) {
    console.error(err);
  }
  try {
    registerGameHandlers(io, socket);
  } catch (err) {
    console.error(err);
  }

  // join player
  socket.on("join-game", async (payload) => {
    console.log("[socket-server] join-game payload received:", payload);
    try {
      await onJoinGame(io, socket, payload);
    } catch (err) {
      console.error("[socket-server] error in onJoinGame:", err);
    }
  });

  // submit answer — registra la respuesta y notifica a jugadores y admins
  socket.on("submit-answer", (payload) => {
    console.log(`[socket-server] ─── submit-answer START ───`);
    console.log(`[socket-server]   socket: ${socket.id}, player: ${payload.playerId}, q: ${payload.questionId}, ans: ${payload.answer}`);

    const result = gameStore.submitAnswer(payload.playerId, payload.questionId, payload.answer);
    if (!result) {
      console.warn(`[socket-server]   submitAnswer FAILED — player not found?`);
      console.log(`[socket-server] ─── submit-answer END (failed) ───`);
      return;
    }

    console.log(`[socket-server]   submitAnswer OK, finishedQuestion: ${result.finishedQuestion}`);

    // Notify the player that their answer was received
    socket.emit("answer-submitted", {
      playerId: payload.playerId,
      questionId: payload.questionId,
      answer: payload.answer,
    });
    console.log(`[socket-server]   emitted answer-submitted to player ${socket.id}`);

    // Find the game containing this player
    let foundGame: any = null;
    for (const g of gameStore.getAllGames()) {
      if (g.players.find((p) => p.id === payload.playerId)) {
        foundGame = g;
        break;
      }
    }

    if (!foundGame) {
      console.warn(`[socket-server]   game not found for player ${payload.playerId}`);
      console.log(`[socket-server] ─── submit-answer END (no game) ───`);
      return;
    }

    console.log(`[socket-server]   found game: ${foundGame.id}, status: ${foundGame.status}, players: ${foundGame.players.length}`);

    // Log each player's answers for debugging
    for (const p of foundGame.players) {
      console.log(`[socket-server]   player ${p.name} (${p.id}): answers=${JSON.stringify(p.answers)}, score=${p.score}`);
    }

    // Emit game-updated to BOTH players and admins so everyone sees the latest state
    io.to(`game-${foundGame.id}`).emit("game-updated", { game: foundGame });
    io.to(`game-${foundGame.id}-admins`).emit("game-updated", { game: foundGame });
    console.log(`[socket-server]   emitted game-updated to game-${foundGame.id} (players) and game-${foundGame.id}-admins`);

    // If all players answered, emit question-finished so clients transition to result state
    if (result.finishedQuestion) {
      io.to(`game-${foundGame.id}`).emit("question-finished", { currentQuestionIndex: foundGame.currentQuestionIndex });
      io.to(`game-${foundGame.id}-admins`).emit("question-finished", { currentQuestionIndex: foundGame.currentQuestionIndex });
      console.log(`[socket-server]   emitted question-finished (all answered) for game ${foundGame.id}`);
    }

    console.log(`[socket-server] ─── submit-answer END ───`);
  });

  // leave player
  socket.on("leave-game", async (payload) => {
    try {
      await onLeaveGame(io, socket, payload);
    } catch (err) {
      console.error("[socket-server] error in onLeaveGame:", err);
    }
  });

  // request dashboard
  socket.on("request-dashboard", async () => {
    try {
      await emitDashboard(io);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on("error", (err) =>
    console.error("[socket-server] socket error:", err)
  );
  socket.on("disconnect", (reason) =>
    console.log("[socket-server] Socket disconnected:", socket.id, reason)
  );
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

connectToDB()
  .then(() =>
    httpServer.listen(PORT, () =>
      console.log(`[socket-server] Listening on port ${PORT}`)
    )
  )
  .catch((err) => {
    console.error("[socket-server] Failed to start:", err);
    process.exit(1);
  });
