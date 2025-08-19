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
  currentQuestionStartTime: number; // timestamp ms
  questionTimeLimit: number; // ms por pregunta
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

export interface JoinGameData {
  gameId: string;
  playerName: string;
}

export interface SubmitAnswerData {
  gameId: string;
  playerId: string;
  questionId: string;
  answer: number;
}

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
    percentage: number;
  }>;
  questionResults?: Array<{
    questionId: string;
    questionText: string;
    correctAnswer: number;
    playerAnswers: Array<{
      playerId: string;
      name: string;
      answer: number;
      isCorrect: boolean;
    }>;
  }>;
  averageScore?: number;
}

export interface SocketEvents {
  // incoming (desde el front al server)
  "join-game": (data: JoinGameData) => void;
  "join-admin": (gameId: string) => void;
  "start-game": (data: { gameId: string }) => void;
  "next-question": (data: { gameId: string }) => void;
  "finish-question": (data: { gameId: string }) => void;
  "finish-game": (data: { gameId: string }) => void;
  "submit-answer": (data: SubmitAnswerData) => void;
  "request-dashboard": () => void;
  "request-game-state": (data: { gameId: string }) => void;

  // emitted by server
  "player-joined": (data: { player: Player }) => void;
  "game-updated": (data: { game: Game }) => void;
  "game-started": (data: {
    game: Game;
    players: Player[];
    currentQuestion: Question;
    results?: any;
    timeLeft: number;
  }) => void;
  "question-updated": (data: {
    question: Question;
    questionIndex: number;
    timeLeft: number;
  }) => void;
  "question-finished": (data: { currentQuestionIndex: number }) => void;
  "answer-submitted": (data: {
    playerId: string;
    questionId: string;
    answer: number;
  }) => void;
  "game-finished": (data: { results: any }) => void;

  // nuevo evento que emite el servidor con el estado actual
  "game-state": (data: {
    game: Game;
    currentQuestion: Question | null;
    currentQuestionIndex: number;
    timeLeft: number;
  }) => void;
}
