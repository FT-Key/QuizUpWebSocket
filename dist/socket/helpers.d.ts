import type { Game as GameType } from "../types/types.js";
import type { GameDoc } from "../types/db.js";
export declare function buildGame(gameDoc: GameDoc): Promise<GameType>;
export declare function emitGameUpdate(io: any, gameId: string): Promise<void>;
export declare function emitDashboard(io: any): Promise<void>;
