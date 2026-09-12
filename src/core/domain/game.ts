import type { Player } from "./player.js";
import type { Question } from "./question.js";

export type GameStatus = "waiting" | "active" | "finished" | "cancelled";

export interface Game {
  id: string; // == gameCode (6 dígitos)
  name: string;
  questions: Question[];
  createdAt: Date;
  creatorId: string;
  status: GameStatus;
  currentQuestionIndex: number;
  players: Player[];
  currentQuestionStartTime: number; // epoch ms; 0 = pregunta no iniciada
  questionTimeLimit: number; // ms (20000 | 30000 | 40000)
  locked?: boolean;
}
