// src/types.ts
export interface Question {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctAnswer: number;
}
export interface Player {
  id: string;
  name: string;
  gameId: string;
  answers: { [questionId: string]: number };
  score: number;
  joinedAt: Date;
}
export interface Game {
  id: string;
  name: string;
  questions: Question[];
  createdAt: Date;
  creatorId: string;
  status: "waiting" | "active" | "finished";
  currentQuestionIndex: number;
  players: Player[];
}
export interface GameState {
  game: Game;
  players: Player[];
  currentQuestion?: Question;
  results?: GameResults;
}
export interface CreateGameData {
  name: string;
  questions: Array<{
    text: string;
    options: [string, string, string, string];
    correctAnswer: number;
  }>;
}
export interface GameResults {
  gameId: string;
  totalPlayers: number;
  totalQuestions: number;
  leaderboard: Array<{
    playerId: string;
    name: string;
    score: number;
    correctAnswers: number;
    percentage: number;
  }>;
}
