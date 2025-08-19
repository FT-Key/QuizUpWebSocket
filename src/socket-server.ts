// src/socket-server.ts
import dotenv from "dotenv";
import path from "path";
import { createServer } from "http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { readFile } from "fs/promises";
import connectToDB from "./mongoose.js";

import registerAdminHandlers from "./socket/handlers/adminHandlers.js";
import registerGameHandlers from "./socket/handlers/gameHandlers.js";
import onJoinGame from "./socket/handlers/playerHandlers.js";
import { emitDashboard, emitGameUpdate } from "./socket/helpers.js";
import { gameStore } from "./gameStore.js";
import type { SocketEvents } from "./types/types.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/** Simple HTTP server to serve index.html for quick testing (if present) */
const httpServer = createServer(async (req, res) => {
  try {
    if (req.url === "/" || req.url === "/index.html") {
      const filePath = path.resolve(process.cwd(), "src", "index.html");
      const html = await readFile(filePath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(html);
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  } catch (err) {
    console.error("[socket-server] httpServer error while responding:", err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

// Tipado con SocketEvents
const io = new SocketIOServer<SocketEvents, SocketEvents>(httpServer, {
  cors: { origin: "*" },
});

/** Global listeners for process-level errors to help debug crashes */
process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection:", reason);
});

/** Optional: small helper to print current memory games (for debug) */
const logMemoryGames = (label = "") => {
  try {
    const ids = Array.from(gameStore.getAllGames().map((g) => g.id));
    console.log(
      `[socket-server] ${label} in-memory games count: ${ids.length}`,
      ids
    );
  } catch (err) {
    console.warn("[socket-server] logMemoryGames failed:", err);
  }
};

io.on("connection", (socket: Socket<SocketEvents, SocketEvents>) => {
  console.log("[socket-server] Socket connected:", socket.id);
  console.log(
    "[socket-server] current socket rooms:",
    Array.from(socket.rooms)
  );

  // registrar handlers con try/catch para no romper el server si un handler lanza
  try {
    registerAdminHandlers(io, socket);
    console.log(
      "[socket-server] registerAdminHandlers executed for",
      socket.id
    );
  } catch (err) {
    console.error("[socket-server] registerAdminHandlers error:", err);
  }

  try {
    registerGameHandlers(io, socket);
    console.log("[socket-server] registerGameHandlers executed for", socket.id);
  } catch (err) {
    console.error("[socket-server] registerGameHandlers error:", err);
  }

  // join player
  socket.on("join-game", async (payload) => {
    console.log(
      "[socket-server] join-game payload received from",
      socket.id,
      "payload:",
      payload
    );
    try {
      await onJoinGame(io, socket, payload);
      console.log("[socket-server] onJoinGame completed for", socket.id);
      logMemoryGames("after onJoinGame");
    } catch (err) {
      console.error("[socket-server] error in onJoinGame:", err);
    }
  });

  // request dashboard
  socket.on("request-dashboard", async () => {
    console.log("[socket-server] request-dashboard from", socket.id);
    try {
      await emitDashboard(io);
      console.log("[socket-server] emitDashboard completed (broadcast)");
    } catch (err) {
      console.error("[socket-server] emitDashboard error:", err);
    }
  });

  // catch socket-level errors
  socket.on("error", (err) => {
    console.error("[socket-server] socket error from", socket.id, "->", err);
  });

  socket.on("disconnect", (reason) => {
    console.log(
      "[socket-server] Socket disconnected:",
      socket.id,
      "reason:",
      reason
    );
  });
});

/** PORT and startup */
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

connectToDB()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(
        `[socket-server] Socket.IO + MongoDB server listening on port ${PORT}`
      );
      logMemoryGames("on server start");
    });
  })
  .catch((err) => {
    console.error(
      "[socket-server] Failed to connect to DB or start server:",
      err
    );
    process.exit(1);
  });

/** Optional: log periodic summary (handy while debugging) */
if (process.env.NODE_ENV !== "production") {
  setInterval(() => {
    try {
      console.log(
        "[socket-server] summary: active sockets =",
        io.engine ? io.engine.clientsCount : "n/a"
      );
      logMemoryGames("periodic");
    } catch (err) {
      // swallow interval errors
    }
  }, 15000);
}
