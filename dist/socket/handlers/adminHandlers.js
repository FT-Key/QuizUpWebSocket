import { Game as GameModel } from "../../models/Game.js";
import { gameStore } from "../../gameStore.js";
import { emitDashboard } from "../helpers.js";
export default function registerAdminHandlers(io, socket) {
    socket.on("join-admin", (gameId) => {
        socket.join(`game-${gameId}-admins`);
    });
    socket.on("lock-game", async ({ gameId, locked }) => {
        const game = gameStore.getGame(gameId);
        if (game)
            game.locked = locked;
        try {
            await GameModel.findOneAndUpdate({ gameCode: gameId }, { locked });
        }
        catch (err) {
            console.error("[adminHandlers] failed to persist lock state:", err);
        }
        if (game) {
            io.to(`game-${gameId}`).emit("game-updated", { game });
            io.to(`game-${gameId}-admins`).emit("game-updated", { game });
        }
    });
    socket.on("close-game", async ({ gameId }) => {
        const game = gameStore.getGame(gameId);
        if (game && game.status !== "waiting") {
            return;
        }
        try {
            await GameModel.findOneAndUpdate({ gameCode: gameId, status: "waiting" }, { status: "cancelled" });
        }
        catch (err) {
            console.error("[adminHandlers] failed to persist cancelled status:", err);
        }
        if (game) {
            gameStore.cancelGame(gameId);
            io.to(`game-${gameId}`).emit("game-cancelled", { game });
            io.to(`game-${gameId}-admins`).emit("game-cancelled", { game });
        }
        await emitDashboard(io).catch(() => { });
    });
}
//# sourceMappingURL=adminHandlers.js.map