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

  // submit answer — solo registra, NO termina la pregunta aunque todos hayan respondido
  socket.on("submit-answer", (payload) => {
    console.log("[socket-server] submit-answer from", socket.id, payload.playerId, "q:", payload.questionId, "ans:", payload.answer);
    const result = gameStore.submitAnswer(payload.playerId, payload.questionId, payload.answer);
    if (!result) {
      console.warn("[socket-server] submitAnswer returned false — player not found?", payload.playerId);
    } else {
      console.log("[socket-server] answer registered, finishedQuestion:", result.finishedQuestion);
    }
    // No emitir question-finished aquí — el timer del servidor es la única fuente de verdad
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
