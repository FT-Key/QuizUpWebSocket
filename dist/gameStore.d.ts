import type { Game, Player, CreateGameData } from "./types/types.js";
declare class GameStore {
    private games;
    private players;
    createGame(data: CreateGameData, creatorId: string): Game;
    addGameFromDb(game: Game): void;
    getGame(gameId: string): Game | undefined;
    removePlayer(gameId: string, playerId: string): boolean;
    addPlayer(gameId: string, playerName: string): Player | null;
    submitAnswer(playerId: string, questionId: string, answer: number): {
        finishedQuestion: boolean;
    } | false;
    startGame(gameId: string): boolean;
    nextQuestion(gameId: string): boolean;
    finishCurrentQuestion(gameId: string): boolean;
    finishGame(gameId: string): boolean;
    cancelGame(gameId: string): boolean;
    getGameResults(gameId: string): {
        gameId: string;
        createdAt: Date;
        totalPlayers: number;
        totalQuestions: number;
        leaderboard: {
            playerId: string;
            name: string;
            score: number;
            correctAnswers: number;
            totalQuestions: number;
            percentage: number;
            avatar: import("./types/types.js").PlayerAvatar | undefined;
        }[];
    } | null;
    getAllGames(): Game[];
}
export declare const gameStore: GameStore;
export {};
