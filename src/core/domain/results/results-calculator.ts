import type { Game } from "../game.js";
import type { PlayerAvatar } from "../player.js";

export interface GameResults {
  gameId: string;
  createdAt: Date;
  totalPlayers: number;
  totalQuestions: number;
  leaderboard: Array<{
    playerId: string;
    name: string;
    score: number;
    correctAnswers: number;
    totalQuestions: number;
    percentage: number; // 0..100
    avatar?: PlayerAvatar;
  }>;
  questionResults?: Array<{
    questionId: string;
    questionText: string;
    correctAnswer: number;
    playerAnswers: Array<{
      playerId: string;
      name: string;
      answer: number; // -1 si no respondió
      isCorrect: boolean;
    }>;
  }>;
  averageScore?: number;
}

export interface ResultsOptions {
  /** Incluye `questionResults`. Default `false` (paridad `gameStore.getGameResults`). */
  readonly includeQuestionResults?: boolean;
  /** Incluye `averageScore`. Default `false` (paridad `gameStore.getGameResults`). */
  readonly includeAverageScore?: boolean;
}

export function calculateResults(game: Game, options: ResultsOptions = {}): GameResults {
  const leaderboard = game.players.map((p) => {
    const correctAnswers = Object.keys(p.answers).filter((qId) => {
      const question = game.questions.find((q) => q.id === qId);
      return question !== undefined && p.answers[qId] === question.correctAnswer;
    }).length;

    return {
      playerId: p.id,
      name: p.name,
      score: p.score,
      correctAnswers,
      totalQuestions: game.questions.length,
      percentage: game.questions.length > 0 ? (correctAnswers / game.questions.length) * 100 : 0,
      avatar: p.avatar,
    };
  });

  const results: GameResults = {
    gameId: game.id,
    createdAt: game.createdAt,
    totalPlayers: game.players.length,
    totalQuestions: game.questions.length,
    leaderboard,
  };

  if (options.includeQuestionResults) {
    results.questionResults = game.questions.map((q) => ({
      questionId: q.id,
      questionText: q.text,
      correctAnswer: q.correctAnswer,
      playerAnswers: game.players.map((p) => ({
        playerId: p.id,
        name: p.name,
        answer: p.answers[q.id] ?? -1,
        isCorrect: p.answers[q.id] === q.correctAnswer,
      })),
    }));
  }

  if (options.includeAverageScore) {
    const total = game.players.reduce((sum, p) => sum + p.score, 0);
    results.averageScore = total / (game.players.length || 1);
  }

  return results;
}
