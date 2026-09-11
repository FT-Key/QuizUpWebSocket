import { createServer, type Server as HttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../../types/types.js";

/** Server HTTP del adaptador (paridad con `socket-server.ts:18-39`). */
export type QuizUpHttpServer = HttpServer;

/**
 * HTTP del proceso WS: `/health` (200 JSON con uptime), `/` y `/index.html`
 * (sirven `src/index.html`, el dashboard estático) y 404 para el resto. Un
 * fallo inesperado responde 500 sin tumbar el server.
 */
export function createHttpServer(): QuizUpHttpServer {
  return createServer(async (req, res) => {
    try {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
      }

      if (req.url === "/" || req.url === "/index.html") {
        const html = await readFile(
          path.resolve(process.cwd(), "src", "index.html"),
          "utf-8"
        );
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(html);
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } catch (err) {
      console.error("[socket-server.adapter] httpServer error:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  });
}

/**
 * Socket.IO tipado con los eventos del contrato y CORS configurable
 * (hoy `origin: "*"`; viene de `AppConfig.corsOrigin`).
 */
export function createSocketServer(
  httpServer: QuizUpHttpServer,
  corsOrigin: string
): Server<ClientToServerEvents, ServerToClientEvents> {
  return new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: corsOrigin },
  });
}
