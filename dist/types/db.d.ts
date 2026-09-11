import { Types } from "mongoose";
import type { PlayerAvatar, QuestionImage } from "./types.js";
export type GameDoc = {
    _id: Types.ObjectId;
    name: string;
    gameCode: string;
    status: "waiting" | "active" | "finished" | "cancelled";
    questions: Array<{
        _id?: any;
        text: string;
        options: [string, string, string, string];
        correctAnswer: number;
        image?: QuestionImage | null;
    }>;
    players: Array<{
        id: string;
        name: string;
        gameId: string;
        answers: Record<string, number>;
        score: number;
        joinedAt: Date;
        avatar?: PlayerAvatar;
    }>;
    createdAt: Date;
    creatorId: string;
    currentQuestionIndex: number;
    currentQuestionStartTime?: number;
    questionTimeLimit?: number;
    locked?: boolean;
};
