export interface QuestionImage {
  url: string;
  thumb?: string;
  alt?: string;
  author?: string;
  authorLink?: string;
}

export interface Question {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctAnswer: number;
  image?: QuestionImage | null;
}

export interface PlayerAvatar {
  seed: string;
  accessories?: string[];
}

export interface Player {
  id: string;
  name: string;
  gameId: string;
  answers: { [questionId: string]: number };
  score: number;
  joinedAt: Date;
  avatar?: PlayerAvatar;
}

export interface Game {
  id: string;
  name: string;
  questions: Question[];
  createdAt: Date;
  creatorId: string;
  status: "waiting" | "active" | "finished" | "cancelled";
  currentQuestionIndex: number;
  players: Player[];
  currentQuestionStartTime: number;
  questionTimeLimit: number;
  locked?: boolean;
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
    image?: QuestionImage | null;
  }>;
}

export interface JoinGameData {
  gameId: string;
  playerId?: string;
  playerName: string;
  avatar?: PlayerAvatar;
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
    avatar?: PlayerAvatar;
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

export interface ClientToServerEvents {
  "join-game": (data: JoinGameData) => void;
  "join-admin": (gameId: string) => void;
  "start-game": (data: { gameId: string }) => void;
  "next-question": (data: { gameId: string }) => void;
  "finish-question": (data: { gameId: string }) => void;
  "finish-game": (data: { gameId: string }) => void;
  "submit-answer": (data: SubmitAnswerData) => void;
  "leave-game": (data: { gameId: string; playerId: string }) => void;
  "lock-game": (data: { gameId: string; locked: boolean }) => void;
  "close-game": (data: { gameId: string }) => void;
  "request-dashboard": () => void;
  "request-game-state": (data: { gameId: string }) => void;
}

export interface ServerToClientEvents {
  joined: (data: { player: Player; game: Game }) => void;
  "player-joined": (data: { player: Player; game: Game }) => void;
  "player-left": (data: { playerId: string; game: Game }) => void;
  "game-updated": (data: { game: Game }) => void;

  "join-error": (data: { message: string }) => void;

  "game-started": (data: {
    game: Game;
    players: Player[];
    currentQuestion: Question;
    results?: any;
    timeLeft: number;
  }) => void;

  "question-changed": (data: {
    question: Question;
    questionIndex: number;
    timeLeft: number;
  }) => void;

  /**
   * @deprecated Evento sin emisor; el evento vigente es `question-changed`.
   * Se elimina en US-15.
   */
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

  "game-finished": (data: { game: Game; results: any }) => void;

  "game-cancelled": (data: { game: Game }) => void;

  "game-state": (data: {
    game: Game;
    currentQuestion: Question | null;
    currentQuestionIndex: number;
    timeLeft: number;
  }) => void;

  "update-dashboard": (data: Game[]) => void;
}

export interface SocketEvents
  extends ClientToServerEvents,
    ServerToClientEvents {}
