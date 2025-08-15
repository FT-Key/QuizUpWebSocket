import type { Game, Player, CreateGameData } from "./types/types.js";
declare class GameStore {
    private games;
    private players;
    createGame(data: CreateGameData, creatorId: string): Game;
    getGame(gameId: string): Game | undefined;
    addPlayer(gameId: string, playerName: string): Player | null;
    submitAnswer(playerId: string, questionId: string, answer: number): boolean;
    startGame(gameId: string): boolean;
    finishGame(gameId: string): boolean;
    getGameResults(gameId: string): {
        totalPlayers: number;
        totalQuestions: number;
        leaderboard: {
            playerId: string;
            name: string;
            score: number;
            correctAnswers: number;
            percentage: number;
        }[];
    } | null;
    getAllGames(): Game[];
}
export declare const gameStore: GameStore;
export {};
