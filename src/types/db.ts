// src/types/db.ts
export type GameDoc = {
  _id: any; // o mongoose.Types.ObjectId si importas mongoose
  name: string;
  status: "waiting" | "active" | "finished";
  questions: Array<{
    _id?: any;
    text: string;
    options: [string, string, string, string];
    correctAnswer: number;
  }>;
  players: Array<{
    id: string;
    name: string;
    gameId: string;
    answers: Record<string, number>;
    score: number;
    joinedAt: Date;
  }>;
  createdAt: Date;
  creatorId: string;
  currentQuestionIndex: number;
};
