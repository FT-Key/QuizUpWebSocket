// src/gameStore.ts
import type { Game, Player, CreateGameData, Question } from "./types/types.js";
import { v4 as uuidv4 } from "uuid";

// In-memory storage
class GameStore {
  private games: Map<string, Game> = new Map();
  private players: Map<string, Player> = new Map();

  createGame(data: CreateGameData, creatorId: string): Game {
    const questions: Question[] = data.questions.map((q) => ({
      id: uuidv4(),
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
    }));

    const game: Game = {
      id: uuidv4(),
      name: data.name,
      questions,
      createdAt: new Date(),
      creatorId,
      status: "waiting",
      currentQuestionIndex: 0,
      players: [],
    };

    this.games.set(game.id, game);
    return game;
  }

  getGame(gameId: string): Game | undefined {
    return this.games.get(gameId);
  }

  addPlayer(gameId: string, playerName: string): Player | null {
    const game = this.games.get(gameId);
    if (!game) return null;

    const player: Player = {
      id: uuidv4(),
      name: playerName,
      gameId,
      answers: {},
      score: 0,
      joinedAt: new Date(),
    };

    this.players.set(player.id, player);
    game.players.push(player);

    return player;
  }

  submitAnswer(playerId: string, questionId: string, answer: number): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    const game = this.games.get(player.gameId);
    if (!game) return false;

    player.answers[questionId] = answer;

    const question = game.questions.find((q) => q.id === questionId);
    if (question && answer === question.correctAnswer) {
      player.score += 1;
    }

    return true;
  }

  startGame(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;
    game.status = "active";
    return true;
  }

  finishGame(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;
    game.status = "finished";
    return true;
  }

  getGameResults(gameId: string) {
    const game = this.games.get(gameId);
    if (!game) return null;

    const leaderboard = game.players.map((p) => ({
      playerId: p.id,
      name: p.name,
      score: p.score,
      correctAnswers: Object.keys(p.answers).filter((qId) => {
        const question = game.questions.find((q) => q.id === qId);
        return question && p.answers[qId] === question.correctAnswer;
      }).length,
      percentage:
        Object.keys(p.answers).length > 0
          ? (Object.keys(p.answers).filter((qId) => {
              const question = game.questions.find((q) => q.id === qId);
              return question && p.answers[qId] === question.correctAnswer;
            }).length /
              game.questions.length) *
            100
          : 0,
    }));

    return {
      totalPlayers: game.players.length,
      totalQuestions: game.questions.length,
      leaderboard,
    };
  }

  getAllGames(): Game[] {
    return Array.from(this.games.values());
  }
}

export const gameStore = new GameStore();
