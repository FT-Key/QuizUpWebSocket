import type { Game, Player, CreateGameData } from "./types/types.js";
declare class GameStore {
    private games;
    private players;
    private questionTimeouts;
    createGame(data: CreateGameData, creatorId: string): Game;
    getGame(gameId: string): Game | undefined;
    addPlayer(gameId: string, playerName: string): Player | null;
    /** Registra la respuesta, calcula score y termina pregunta si todos respondieron */
    submitAnswer(playerId: string, questionId: string, answer: number): {
        finishedQuestion: boolean;
    } | false;
    /** Comienza el juego y lanza primer timeout */
    startGame(gameId: string): boolean;
    nextQuestion(gameId: string): boolean;
    /** Fin manual o automático de la pregunta actual */
    finishCurrentQuestion(gameId: string): boolean;
    finishGame(gameId: string): boolean;
    private setQuestionTimeout;
    private clearQuestionTimeout;
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
