import type { Game, Player, CreateGameData, Question } from "./types/types.js";
import { v4 as uuidv4 } from "uuid";
import { DEFAULT_TIME_LIMIT_MS } from "./constants/game.js";
import { calculateResults } from "./core/domain/results/results-calculator.js";

class GameStore {
  private games: Map<string, Game> = new Map();
  private players: Map<string, Player> = new Map();

  createGame(data: CreateGameData, creatorId: string): Game {
    const questions: Question[] = data.questions.map((q) => ({
      id: uuidv4(),
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
      image: q.image ?? null,
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
      currentQuestionStartTime: 0,
      questionTimeLimit: DEFAULT_TIME_LIMIT_MS,
    };

    this.games.set(game.id, game);
    return game;
  }

  addGameFromDb(game: Game) {
    this.games.set(game.id, game);
  }

  getGame(gameId: string): Game | undefined {
    return this.games.get(gameId);
  }

  removePlayer(gameId: string, playerId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;
    game.players = game.players.filter((p) => p.id !== playerId);
    this.players.delete(playerId);
    return true;
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

  submitAnswer(
    playerId: string,
    questionId: string,
    answer: number
  ): { finishedQuestion: boolean } | false {
    let player: Player | undefined;
    let game: Game | undefined;

    for (const g of this.games.values()) {
      const found = g.players.find((p) => p.id === playerId);
      if (found) {
        player = found;
        game = g;
        break;
      }
    }

    if (!player || !game) return false;

    const question = game.questions.find((q) => q.id === questionId);
    if (!question) return false;

    player.answers[questionId] = answer;

    if (answer === question.correctAnswer) {
      player.score += 1;
      const elapsed = Date.now() - game.currentQuestionStartTime;
      const remainingMs = game.questionTimeLimit - elapsed;
      if (remainingMs > 0) {
        player.score += Math.floor(remainingMs / 10);
      }
    }

    const allAnswered = game.players.every(
      (p) => p.answers[questionId] !== undefined
    );
    if (allAnswered) {
      this.finishCurrentQuestion(game.id);
      return { finishedQuestion: true };
    }

    return { finishedQuestion: false };
  }

  startGame(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;

    game.status = "active";
    game.currentQuestionIndex = 0;
    game.currentQuestionStartTime = Date.now();

    return true;
  }

  nextQuestion(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;

    if (game.currentQuestionIndex + 1 < game.questions.length) {
      game.currentQuestionIndex += 1;
      game.currentQuestionStartTime = Date.now();
      return true;
    } else {
      this.finishGame(gameId);
      return false;
    }
  }

  finishCurrentQuestion(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;

    game.currentQuestionStartTime = 0;
    return true;
  }

  finishGame(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;

    game.status = "finished";
    return true;
  }

  cancelGame(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;
    if (game.status !== "waiting") return false;

    game.status = "cancelled";
    return true;
  }

  getGameResults(gameId: string) {
    const game = this.games.get(gameId);
    if (!game) return null;
    return calculateResults(game);
  }

  getAllGames(): Game[] {
    return Array.from(this.games.values());
  }
}

export const gameStore = new GameStore();
