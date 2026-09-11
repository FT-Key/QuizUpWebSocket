import mongoose from "mongoose";
const { Schema, model, models } = mongoose;
const questionImageSchema = new Schema({
    url: { type: String, required: true },
    thumb: { type: String },
    alt: { type: String },
    author: { type: String },
    authorLink: { type: String },
}, { _id: false });
const questionSchema = new Schema({
    text: { type: String, required: true },
    options: { type: [String], required: true, length: 4 },
    correctAnswer: { type: Number, required: true },
    image: { type: questionImageSchema, default: null },
});
const playerAvatarSchema = new Schema({
    seed: { type: String, required: true },
    accessories: [{ type: String }],
}, { _id: false });
const playerSchema = new Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    gameId: { type: String, required: true },
    answers: { type: Map, of: Number, default: {} },
    score: { type: Number, default: 0 },
    joinedAt: { type: Date, default: Date.now },
    avatar: { type: playerAvatarSchema, default: null },
});
const gameSchema = new Schema({
    name: { type: String, required: true },
    gameCode: { type: String, required: true, unique: true, index: true },
    questions: { type: [questionSchema], required: true },
    createdAt: { type: Date, default: Date.now },
    creatorId: { type: String, required: true },
    status: {
        type: String,
        enum: ["waiting", "active", "finished", "cancelled"],
        default: "waiting",
    },
    currentQuestionIndex: { type: Number, default: 0 },
    currentQuestionStartTime: { type: Number, default: 0 },
    questionTimeLimit: { type: Number, default: 30000 },
    locked: { type: Boolean, default: false },
    players: { type: [playerSchema], default: [] },
});
export const Game = models.Game || model("Game", gameSchema);
//# sourceMappingURL=Game.js.map