import { Server, Socket } from "socket.io";
import type { Player, Game, SocketEvents, PlayerAvatar } from "../../types/types.js";
interface JoinPayload {
    gameId: string;
    playerId?: string;
    playerName?: string;
    avatar?: PlayerAvatar;
}
export declare function onLeaveGame(io: Server<SocketEvents, SocketEvents>, socket: Socket<SocketEvents, SocketEvents>, { gameId, playerId }: {
    gameId: string;
    playerId: string;
}): Promise<void>;
export default function onJoinGame(io: Server<SocketEvents, SocketEvents>, socket: Socket<SocketEvents, SocketEvents>, { gameId, playerId, playerName, avatar }: JoinPayload): Promise<{
    player: Player;
    game: Game;
}>;
export {};
