import dotenv from "dotenv";
import path from "path";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { readFile } from "fs/promises";
import connectToDB from "./mongoose.js";
import registerAdminHandlers from "./socket/handlers/adminHandlers.js";
import registerGameHandlers from "./socket/handlers/gameHandlers.js";
import onJoinGame, { onLeaveGame } from "./socket/handlers/playerHandlers.js";
import { emitDashboard } from "./socket/helpers.js";
import { gameStore } from "./gameStore.js";
import { startStaleGamesCleanup } from "./cleanupStaleGames.js";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
const httpServer = createServer(async (req, res) => {
    try {
        if (req.url === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
        }
        if (req.url === "/" || req.url === "/index.html") {
            const html = await readFile(path.resolve(process.cwd(), "src", "index.html"), "utf-8");
            res.writeHead(200, { "Content-Type": "text/html" });
            return res.end(html);
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
    }
    catch (err) {
        console.error("[socket-server] httpServer error:", err);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
    }
});
const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
});
process.on("uncaughtException", (err) => console.error("[process] uncaughtException:", err));
process.on("unhandledRejection", (reason) => console.error("[process] unhandledRejection:", reason));
io.on("connection", (socket) => {
    try {
        registerAdminHandlers(io, socket);
    }
    catch (err) {
        console.error(err);
    }
    try {
        registerGameHandlers(io, socket);
    }
    catch (err) {
        console.error(err);
    }
    socket.on("join-game", async (payload) => {
        try {
            await onJoinGame(io, socket, payload);
        }
        catch (err) {
            console.error("[socket-server] error in onJoinGame:", err);
        }
    });
    socket.on("submit-answer", (payload) => {
        const result = gameStore.submitAnswer(payload.playerId, payload.questionId, payload.answer);
        if (!result) {
            return;
        }
        socket.emit("answer-submitted", {
            playerId: payload.playerId,
            questionId: payload.questionId,
            answer: payload.answer,
        });
        let foundGame = null;
        for (const g of gameStore.getAllGames()) {
            if (g.players.find((p) => p.id === payload.playerId)) {
                foundGame = g;
                break;
            }
        }
        if (!foundGame) {
            return;
        }
        io.to(`game-${foundGame.id}`).emit("game-updated", { game: foundGame });
        io.to(`game-${foundGame.id}-admins`).emit("game-updated", { game: foundGame });
        if (result.finishedQuestion) {
            io.to(`game-${foundGame.id}`).emit("question-finished", { currentQuestionIndex: foundGame.currentQuestionIndex });
            io.to(`game-${foundGame.id}-admins`).emit("question-finished", { currentQuestionIndex: foundGame.currentQuestionIndex });
        }
    });
    socket.on("leave-game", async (payload) => {
        try {
            await onLeaveGame(io, socket, payload);
        }
        catch (err) {
            console.error("[socket-server] error in onLeaveGame:", err);
        }
    });
    socket.on("request-dashboard", async () => {
        try {
            await emitDashboard(io);
        }
        catch (err) {
            console.error(err);
        }
    });
    socket.on("error", (err) => console.error("[socket-server] socket error:", err));
});
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
connectToDB()
    .then(() => httpServer.listen(PORT, () => {
    startStaleGamesCleanup(io);
}))
    .catch((err) => {
    console.error("[socket-server] Failed to start:", err);
    process.exit(1);
});
//# sourceMappingURL=socket-server.js.map