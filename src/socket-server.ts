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

const httpServer = createServer(async (req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const filePath = path.resolve(process.cwd(), "src", "index.html");
    const html = await readFile(filePath, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(html);
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

// Tipado con SocketEvents
const io = new SocketIOServer<SocketEvents, SocketEvents>(httpServer, {
  cors: { origin: "*" },
});

io.on("connection", (socket: Socket<SocketEvents, SocketEvents>) => {
  console.log("Socket connected:", socket.id);

  // Handlers
  registerAdminHandlers(io, socket);
  registerGameHandlers(io, socket);

  // join player
  socket.on("join-game", async (payload) => {
    await onJoinGame(io, socket, payload);
  });

  // request dashboard
  socket.on("request-dashboard", async () => {
    await emitDashboard(io);
  });

  // Ya NO emitimos game-state aquí, se maneja en gameHandlers

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

connectToDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Socket.IO + MongoDB server listening on port ${PORT}`);
  });
});
