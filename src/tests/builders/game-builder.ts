import type { Game, GameStatus } from "../../core/domain/game.js";
import type { Player } from "../../core/domain/player.js";
import type { Question } from "../../core/domain/question.js";
import { DEFAULT_TIME_LIMIT_MS } from "../../constants/game.js";

export class GameBuilder {
  private game: Game = {
    id: "game-1",
    name: "Partida de prueba",
    questions: [],
    createdAt: new Date(0),
    creatorId: "creator-1",
    status: "waiting",
    currentQuestionIndex: 0,
    players: [],
    currentQuestionStartTime: 0,
    questionTimeLimit: DEFAULT_TIME_LIMIT_MS,
  };

  withId(id: string): this {
    this.game.id = id;
    return this;
  }

  withName(name: string): this {
    this.game.name = name;
    return this;
  }

  withCreatorId(creatorId: string): this {
    this.game.creatorId = creatorId;
    return this;
  }

  withCreatedAt(createdAt: Date): this {
    this.game.createdAt = createdAt;
    return this;
  }

  withStatus(status: GameStatus): this {
    this.game.status = status;
    return this;
  }

  withQuestions(...questions: Question[]): this {
    this.game.questions = [...questions];
    return this;
  }

  withQuestion(question: Question): this {
    this.game.questions.push(question);
    return this;
  }

  withPlayers(...players: Player[]): this {
    this.game.players = [...players];
    return this;
  }

  withPlayer(player: Player): this {
    this.game.players.push(player);
    return this;
  }

  withCurrentQuestionIndex(index: number): this {
    this.game.currentQuestionIndex = index;
    return this;
  }

  withCurrentQuestionStartTime(startTime: number): this {
    this.game.currentQuestionStartTime = startTime;
    return this;
  }

  withQuestionTimeLimit(limitMs: number): this {
    this.game.questionTimeLimit = limitMs;
    return this;
  }

  withLocked(locked: boolean): this {
    this.game.locked = locked;
    return this;
  }

  build(): Game {
    return {
      ...this.game,
      createdAt: new Date(this.game.createdAt.getTime()),
      questions: this.game.questions.map((q) => ({
        ...q,
        options: [...q.options] as [string, string, string, string],
      })),
      players: this.game.players.map((p) => ({
        ...p,
        answers: { ...p.answers },
        joinedAt: new Date(p.joinedAt.getTime()),
      })),
    };
  }
}
