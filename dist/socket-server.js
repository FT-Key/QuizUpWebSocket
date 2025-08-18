// src/socket-server.ts
import dotenv from "dotenv";
import path from "path";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { readFile } from "fs/promises";
import connectToDB from "./mongoose.js";
import { Game as GameModel } from "./models/Game.js";
import crypto from "crypto";
import { DEFAULT_TIME_LIMIT_MS } from "./constants/game.js";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
const httpServer = createServer(async (req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
        try {
            const filePath = path.resolve(process.cwd(), "src", "index.html");
            const html = await readFile(filePath, "utf-8");
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(html);
        }
        catch (err) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Error loading index.html");
            console.error(err);
        }
    }
    else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
    }
});
const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });
// Timeouts para preguntas activas
const activeQuestionTimeouts = new Map();
// ---------------------- Helpers ----------------------
async function getDashboardState() {
    const gamesDocs = await GameModel.find()
        .sort({ createdAt: -1 })
        .lean();
    return gamesDocs.map((g) => ({
        id: g._id.toString(),
        name: g.name,
        status: g.status,
        questions: (g.questions || []).map((q) => ({
            id: q._id?.toString() || "",
            text: q.text,
            options: q.options,
            correctAnswer: q.correctAnswer,
        })),
        players: (g.players || []).map((p) => ({
            id: p.id,
            name: p.name,
            gameId: g._id.toString(),
            answers: p.answers,
            score: p.score,
            joinedAt: p.joinedAt,
        })),
        createdAt: g.createdAt,
        creatorId: g.creatorId,
        currentQuestionIndex: g.currentQuestionIndex,
        currentQuestionStartTime: g.currentQuestionStartTime || Date.now(),
        questionTimeLimit: g.questionTimeLimit || DEFAULT_TIME_LIMIT_MS,
    }));
}
async function emitGameUpdate(gameId) {
    const gameDoc = await GameModel.findById(gameId).lean();
    if (!gameDoc)
        return;
    const game = {
        id: gameDoc._id.toString(),
        name: gameDoc.name,
        status: gameDoc.status,
        questions: (gameDoc.questions || []).map((q) => ({
            id: q._id?.toString() || "",
            text: q.text,
            options: q.options,
            correctAnswer: q.correctAnswer,
        })),
        players: (gameDoc.players || []).map((p) => ({
            id: p.id,
            name: p.name,
            gameId: gameDoc._id.toString(),
            answers: p.answers,
            score: p.score,
            joinedAt: p.joinedAt,
        })),
        createdAt: gameDoc.createdAt,
        creatorId: gameDoc.creatorId,
        currentQuestionIndex: gameDoc.currentQuestionIndex,
        currentQuestionStartTime: gameDoc.currentQuestionStartTime || Date.now(),
        questionTimeLimit: gameDoc.questionTimeLimit || DEFAULT_TIME_LIMIT_MS,
    };
    io.to(`game-${gameId}-admins`).emit("game-updated", { game });
}
async function emitDashboard() {
    const games = await getDashboardState();
    io.emit("update-dashboard", games);
}
function startQuestionTimeout(gameId, timeLimit) {
    if (activeQuestionTimeouts.has(gameId)) {
        clearTimeout(activeQuestionTimeouts.get(gameId));
    }
    const timeout = setTimeout(async () => {
        const game = await GameModel.findById(gameId);
        if (!game || game.status !== "active")
            return;
        // fin automático de la pregunta
        game.currentQuestionStartTime = 0;
        await game.save();
        await emitGameUpdate(gameId);
        io.to(`game-${gameId}-players`).emit("question-finished", {
            currentQuestionIndex: game.currentQuestionIndex,
        });
    }, timeLimit);
    activeQuestionTimeouts.set(gameId, timeout);
}
// ---------------------- Socket Events ----------------------
io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
    // Admin se une
    socket.on("join-admin", (gameId) => {
        socket.join(`game-${gameId}-admins`);
    });
    // Player se une
    socket.on("join-game", async (data) => {
        const game = await GameModel.findById(data.gameId);
        if (!game)
            return;
        // Evitar duplicados simple por IP
        const ip = socket.handshake.address;
        const alreadyConnected = game.players.find((p) => p.id === ip);
        if (alreadyConnected)
            return;
        let player;
        if (!data.playerId && data.playerName) {
            player = {
                id: crypto.randomUUID(),
                name: data.playerName,
                gameId: data.gameId,
                answers: {},
                score: 0,
                joinedAt: new Date(),
            };
            game.players.push(player);
            await game.save();
        }
        else if (data.playerId) {
            player = game.players.find((p) => p.id === data.playerId);
        }
        socket.join(`game-${data.gameId}-players`);
        await emitDashboard();
        await emitGameUpdate(data.gameId);
    });
    // Start game
    socket.on("start-game", async ({ gameId }) => {
        const game = await GameModel.findById(gameId);
        if (!game)
            return;
        game.status = "active";
        game.currentQuestionIndex = 0;
        game.currentQuestionStartTime = Date.now();
        await game.save();
        startQuestionTimeout(gameId, game.questionTimeLimit);
        await emitDashboard();
        await emitGameUpdate(gameId);
        const currentQuestion = game.questions[0];
        io.to(`game-${gameId}-players`).emit("game-started", {
            question: currentQuestion,
            timeLeft: game.questionTimeLimit / 1000,
        });
    });
    // Submit answer
    socket.on("submit-answer", async (data) => {
        const { gameId, playerId, questionId, answer } = data;
        // 1) obtenemos el juego
        const game = await GameModel.findById(gameId);
        if (!game)
            return;
        // 2) actualizamos respuesta y score
        const player = game.players.find((p) => p.id === playerId);
        const question = game.questions.find((q) => q._id.toString() === questionId);
        if (!player || !question)
            return;
        player.answers[questionId] = answer;
        if (answer === question.correctAnswer) {
            player.score += 1;
            const elapsed = Date.now() - game.currentQuestionStartTime;
            const remainingMs = game.questionTimeLimit - elapsed;
            const remainingSeconds = Math.floor(remainingMs / 1000);
            if (remainingSeconds > 0)
                player.score += remainingSeconds;
        }
        // Guardamos el juego actualizado (Mongo)
        await game.save();
        // 3) Volvemos a cargar el juego actualizado desde Mongo para emitir
        const updatedGame = await GameModel.findById(gameId).lean();
        if (updatedGame) {
            io.to(`game-${gameId}-admins`).emit("game-updated", {
                game: updatedGame,
            });
        }
        // Emitimos que un jugador ha respondido (puede usarse o no en el front)
        io.to(`game-${gameId}-players`).emit("answer-submitted", { playerId });
        // 4) si todos respondieron → terminamos pregunta automáticamente
        if (updatedGame &&
            updatedGame.players.every((p) => p.answers && p.answers[questionId] !== undefined)) {
            // limpiamos timeout de la pregunta
            if (activeQuestionTimeouts.has(gameId)) {
                clearTimeout(activeQuestionTimeouts.get(gameId));
                activeQuestionTimeouts.delete(gameId);
            }
            // marcamos fin de pregunta
            await GameModel.updateOne({ _id: gameId }, { currentQuestionStartTime: 0 });
            io.to(`game-${gameId}-players`).emit("question-finished", {
                currentQuestionIndex: updatedGame.currentQuestionIndex,
            });
        }
    });
    // Next question
    socket.on("next-question", async ({ gameId }) => {
        const game = await GameModel.findById(gameId);
        if (!game)
            return;
        if (game.currentQuestionIndex + 1 >= game.questions.length) {
            game.status = "finished";
            game.currentQuestionStartTime = 0;
        }
        else {
            game.currentQuestionIndex += 1;
            game.currentQuestionStartTime = Date.now();
            startQuestionTimeout(gameId, game.questionTimeLimit);
        }
        await game.save();
        await emitDashboard();
        await emitGameUpdate(gameId);
        if (game.status === "finished") {
            io.to(`game-${gameId}-players`).emit("game-finished", {});
        }
        else {
            const nextQuestion = game.questions[game.currentQuestionIndex];
            io.to(`game-${gameId}-players`).emit("question-updated", {
                question: nextQuestion,
                currentQuestionIndex: game.currentQuestionIndex,
                timeLeft: game.questionTimeLimit / 1000,
            });
        }
    });
    // Finish current question manual
    socket.on("finish-question", async ({ gameId }) => {
        if (activeQuestionTimeouts.has(gameId)) {
            clearTimeout(activeQuestionTimeouts.get(gameId));
            activeQuestionTimeouts.delete(gameId);
        }
        const game = await GameModel.findById(gameId);
        if (!game)
            return;
        game.currentQuestionStartTime = 0;
        await game.save();
        await emitGameUpdate(gameId);
        io.to(`game-${gameId}-players`).emit("question-finished", {
            currentQuestionIndex: game.currentQuestionIndex,
        });
    });
    // Finish entire game
    socket.on("finish-game", async ({ gameId }) => {
        if (activeQuestionTimeouts.has(gameId)) {
            clearTimeout(activeQuestionTimeouts.get(gameId));
            activeQuestionTimeouts.delete(gameId);
        }
        const game = await GameModel.findById(gameId);
        if (!game)
            return;
        game.status = "finished";
        game.currentQuestionStartTime = 0;
        await game.save();
        await emitDashboard();
        await emitGameUpdate(gameId);
        io.to(`game-${gameId}-players`).emit("game-finished", {});
    });
    // Dashboard request
    socket.on("request-dashboard", async () => {
        await emitDashboard();
    });
    socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.id);
    });
});
// ---------------------- Puerto ----------------------
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
connectToDB()
    .then(() => {
    httpServer.listen(PORT, () => {
        console.log(`Socket.IO + MongoDB server listening on port ${PORT}`);
    });
})
    .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
});
//# sourceMappingURL=socket-server.js.map