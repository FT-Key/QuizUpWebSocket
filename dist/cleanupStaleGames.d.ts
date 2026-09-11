export declare function getWaitingGameExpiryMs(): number;
export declare function isWaitingGameExpired(createdAt: Date | string | number, now?: number): boolean;
export declare function cancelStaleWaitingGames(io: any): Promise<void>;
export declare function startStaleGamesCleanup(io: any): void;
