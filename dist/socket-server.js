// src/socket-server.ts
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import connectToDB from "./mongoose.js";
import { Game as GameModel } from "./models/Game.js";
const httpServer = createServer((req, res) => {
    if (req.url === "/" || req.url === "/index") {
        const html = `
      <html>
        <head>
          <title>QuizUp Stats</title>
          <style>
            body { font-family: Arial, sans-serif; background: #f4f4f9; margin: 0; padding: 20px; }
            h1 { text-align: center; color: #333; }
            .game-card { background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
            .game-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            .game-header h2 { margin: 0; color: #007bff; }
            .game-header span { font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; }
            th { background-color: #007bff; color: white; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .status-waiting { color: #ffc107; font-weight: bold; }
            .status-active { color: #28a745; font-weight: bold; }
            .status-finished { color: #dc3545; font-weight: bold; }
          </style>
          <script src="/socket.io/socket.io.js"></script>
          <script>
            const socket = io();

            function renderGames(games) {
              const container = document.getElementById("games-container");
              container.innerHTML = "";
              const totalGames = games.length;
              const totalPlayers = games.reduce((acc, g) => acc + g.players.length, 0);
              container.innerHTML += \`
                <div style="margin-bottom: 20px; font-weight: bold;">
                  Total Games: \${totalGames} | Total Players: \${totalPlayers}
                </div>
              \`;
              if (totalGames === 0) {
                container.innerHTML += "<p>No games created yet</p>";
                return;
              }
              games.forEach((game) => {
                let html = \`
                  <div class="game-card">
                    <div class="game-header">
                      <h2>\${game.name || "Unnamed Game"}</h2>
                      <span class="status-\${game.status}">\${game.status.toUpperCase()}</span>
                    </div>
                    <p><strong>Players:</strong> \${game.players.length} | <strong>Questions:</strong> \${game.questions.length}</p>
                \`;
                if (game.players.length > 0) {
                  html += \`
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Player</th>
                          <th>Score</th>
                          <th>Correct Answers</th>
                          <th>Percentage</th>
                        </tr>
                      </thead>
                      <tbody>
                  \`;
                  game.players.forEach((p, i) => {
                    const correctAnswers = Object.keys(p.answers || {}).filter(qId => {
                      const q = game.questions.find(q => q.id === qId || q._id === qId);
                      return q && p.answers[qId] === q.correctAnswer;
                    }).length;
                    const percentage = game.questions.length ? (correctAnswers / game.questions.length) * 100 : 0;
                    html += \`
                      <tr>
                        <td>\${i + 1}</td>
                        <td>\${p.name}</td>
                        <td>\${p.score}</td>
                        <td>\${correctAnswers}</td>
                        <td>\${percentage.toFixed(2)}%</td>
                      </tr>
                    \`;
                  });
                  html += "</tbody></table>";
                } else {
                  html += "<p>No players yet</p>";
                }
                html += "</div>";
                container.innerHTML += html;
              });
            }

            socket.on("update-dashboard", (games) => renderGames(games));
            window.addEventListener("DOMContentLoaded", () => socket.emit("request-dashboard"));
          </script>
        </head>
        <body>
          <h1>QuizUp Games Stats</h1>
          <div id="games-container"></div>
        </body>
      </html>
    `;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
    }
    else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
    }
});
const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });
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
    }));
}
// Función auxiliar para emitir a todos los admins de un juego
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
    };
    io.to(`game-${gameId}-admins`).emit("game-updated", { game });
}
io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
    // ---- Admin joins
    socket.on("join-admin", (gameId) => {
        socket.join(`game-${gameId}-admins`);
        console.log(`Admin joined room game-${gameId}-admins`);
    });
    // ---- Player joins
    socket.on("join-game", async ({ gameId, playerId }) => {
        socket.join(`game-${gameId}-players`); // <-- sala de jugadores
        console.log(`Player ${playerId} joined game ${gameId}`);
        // Actualizamos dashboard
        const games = await getDashboardState();
        io.emit("update-dashboard", games);
        // Emitimos a admins
        await emitGameUpdate(gameId);
    });
    // ---- Start game
    socket.on("start-game", async ({ gameId }) => {
        // Actualizamos dashboard global
        const games = await getDashboardState();
        io.emit("update-dashboard", games);
        // Emitimos a admins de ese juego
        await emitGameUpdate(gameId);
        // Emitimos a todos los jugadores del juego
        io.to(`game-${gameId}-players`).emit("game-started", { gameId });
    });
    // ---- Submit answer
    socket.on("submit-answer", async ({ gameId }) => {
        const games = await getDashboardState();
        io.emit("update-dashboard", games);
        await emitGameUpdate(gameId);
    });
    // ---- Finish game
    socket.on("finish-game", async ({ gameId }) => {
        const games = await getDashboardState();
        io.emit("update-dashboard", games);
        await emitGameUpdate(gameId);
        io.to(`game-${gameId}-admins`).emit("game-finished", {
            results: "updated",
        });
    });
    // ---- Request dashboard (for stats page)
    socket.on("request-dashboard", async () => {
        const games = await getDashboardState();
        socket.emit("update-dashboard", games);
    });
    socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.id);
    });
});
// Puerto
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
// Conectar MongoDB y levantar server
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