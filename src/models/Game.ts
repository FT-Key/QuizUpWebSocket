import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const questionSchema = new Schema({
  text: { type: String, required: true },
  options: { type: [String], required: true, length: 4 },
  correctAnswer: { type: Number, required: true },
});

const playerSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  gameId: { type: String, required: true },
  answers: { type: Map, of: Number, default: {} }, // questionId -> answerIndex
  score: { type: Number, default: 0 },
  joinedAt: { type: Date, default: Date.now },
});

const gameSchema = new Schema({
  name: { type: String, required: true },
  gameCode: { type: String, required: true, unique: true, index: true },
  questions: { type: [questionSchema], required: true },
  createdAt: { type: Date, default: Date.now },
  creatorId: { type: String, required: true },
  status: {
    type: String,
    enum: ["waiting", "active", "finished"],
    default: "waiting",
  },
  currentQuestionIndex: { type: Number, default: 0 },
  currentQuestionStartTime: { type: Number, default: 0 },
  questionTimeLimit: { type: Number, default: 30000 },
  players: { type: [playerSchema], default: [] },
});

export const Game = models.Game || model("Game", gameSchema);
