import { Game as GameModel } from "../models/Game.js";
import { DEFAULT_TIME_LIMIT_MS } from "../constants/game.js";
export async function buildGame(gameDoc) {
    return {
        id: gameDoc.gameCode,
        name: gameDoc.name,
        status: gameDoc.status,
        questions: (gameDoc.questions || []).map((q) => ({
            id: q._id?.toString() || "",
            text: q.text,
            options: q.options,
            correctAnswer: q.correctAnswer,
            image: q.image ?? null,
        })),
        players: (gameDoc.players || []).map((p) => {
            const plainAnswers = {};
            const raw = p.answers;
            if (raw instanceof Map) {
                for (const [k, v] of raw)
                    plainAnswers[k] = v;
            }
            else if (raw && typeof raw === "object") {
                Object.assign(plainAnswers, raw);
            }
            return {
                id: p.id,
                name: p.name,
                gameId: gameDoc.gameCode,
                answers: plainAnswers,
                score: p.score,
                joinedAt: p.joinedAt,
                avatar: p.avatar ?? undefined,
            };
        }),
        createdAt: gameDoc.createdAt,
        creatorId: gameDoc.creatorId,
        currentQuestionIndex: gameDoc.currentQuestionIndex,
        currentQuestionStartTime: gameDoc.currentQuestionStartTime ?? 0,
        questionTimeLimit: gameDoc.questionTimeLimit || DEFAULT_TIME_LIMIT_MS,
        locked: gameDoc.locked ?? false,
    };
}
export async function emitGameUpdate(io, gameId) {
    const doc = await GameModel.findOne({ gameCode: gameId }).lean();
    if (!doc)
        return;
    const game = await buildGame(doc);
    io.to(`game-${gameId}-admins`).emit("game-updated", { game });
    io.to(`game-${gameId}`).emit("game-updated", { game });
}
export async function emitDashboard(io) {
    const docs = await GameModel.find().sort({ createdAt: -1 }).lean();
    const games = await Promise.all(docs.map(buildGame));
    io.emit("update-dashboard", games);
}
//# sourceMappingURL=helpers.js.map