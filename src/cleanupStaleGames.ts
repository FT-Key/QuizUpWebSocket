import { Game as GameModel } from "./models/Game.js";
import { gameStore } from "./gameStore.js";
import { emitDashboard } from "./socket/helpers.js";

const DEFAULT_EXPIRY_MINUTES = 60;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function getWaitingGameExpiryMs(): number {
  const minutes = Number(process.env.GAME_EXPIRY_MINUTES);
  const valid =
    Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_EXPIRY_MINUTES;
  return valid * 60 * 1000;
}

export function isWaitingGameExpired(
  createdAt: Date | string | number,
  now = Date.now()
): boolean {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return now - created > getWaitingGameExpiryMs();
}

export async function cancelStaleWaitingGames(io: any) {
  const cutoff = new Date(Date.now() - getWaitingGameExpiryMs());

  try {
    const stale = await GameModel.find({
      status: "waiting",
      createdAt: { $lt: cutoff },
    })
      .select("gameCode")
      .lean<Array<{ gameCode: string }>>();

    if (stale.length === 0) return;

    const codes = stale.map((g) => g.gameCode);

    await GameModel.updateMany(
      { gameCode: { $in: codes }, status: "waiting" },
      { status: "cancelled" }
    );

    for (const code of codes) {
      const game = gameStore.getGame(code);
      if (game && game.status === "waiting") {
        gameStore.cancelGame(code);
        io.to(`game-${code}`).emit("game-cancelled", { game });
        io.to(`game-${code}-admins`).emit("game-cancelled", { game });
      }
    }

    await emitDashboard(io).catch(() => {});
  } catch (err) {
    console.error("[cleanup] Error cerrando partidas pendientes:", err);
  }
}

export function startStaleGamesCleanup(io: any) {
  void cancelStaleWaitingGames(io);
  const timer = setInterval(
    () => void cancelStaleWaitingGames(io),
    CHECK_INTERVAL_MS
  );
  timer.unref?.();
}
