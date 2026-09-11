import type { Socket } from "socket.io";
import type { SocketEvents } from "../../types/types.js";
export default function registerGameHandlers(io: any, socket: Socket<SocketEvents, SocketEvents>): void;
