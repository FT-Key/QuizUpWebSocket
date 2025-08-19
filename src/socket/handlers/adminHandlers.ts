// src/socket/handlers/adminHandlers.ts
import type { Socket } from "socket.io";

export default function registerAdminHandlers(io: any, socket: Socket) {
  socket.on("join-admin", (gameId: string) => {
    console.log(
      `[adminHandlers] join-admin from ${socket.id} for game ${gameId}`
    );
    socket.join(`game-${gameId}-admins`);
    console.log(
      `[adminHandlers] ${socket.id} joined room game-${gameId}-admins`
    );
  });
}
