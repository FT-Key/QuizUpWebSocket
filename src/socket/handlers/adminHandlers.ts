// src/socket/handlers/adminHandlers.ts
import type { Socket } from "socket.io";

export default function registerAdminHandlers(io: any, socket: Socket) {
  socket.on("join-admin", (gameId: string) => {
    socket.join(`game-${gameId}-admins`);
    console.log(`Admin joined game ${gameId}`);
  });
}
