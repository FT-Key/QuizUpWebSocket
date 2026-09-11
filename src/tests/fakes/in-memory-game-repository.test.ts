import { describe, expect, it } from "vitest";
import type { GameStatus } from "../../core/domain/game.js";
import { GameBuilder } from "../builders/game-builder.js";
import { createFixedClock } from "./fixed-clock.js";
import { createInMemoryGameRepository } from "./in-memory-game-repository.js";

/**
 * Poda de la caché del fake (US-08): TTL de `finished`/`cancelled`, tope con
 * evicción de las finalizadas más antiguas, `waiting`/`active` intactas e
 * idempotencia. La paridad fake↔Mongo se verifica además en la suite de
 * contrato (`src/tests/contract/repository.contract.test.ts`).
 */
const NOW = Date.parse("2026-06-01T00:00:00.000Z");
const TTL_MS = 60 * 60 * 1000;

function createRepo(options: { ttlMs?: number; maxCachedGames?: number } = {}) {
  return createInMemoryGameRepository({
    clock: createFixedClock(NOW),
    ttlMs: TTL_MS,
    maxCachedGames: 500,
    ...options,
  });
}

function game(id: string, status: GameStatus, createdAt: number) {
  return new GameBuilder().withId(id).withStatus(status).withCreatedAt(new Date(createdAt)).build();
}

describe("InMemoryGameRepository.prune", () => {
  it("poda por TTL las finished/cancelled vencidas y conserva las recientes", async () => {
    const repo = createRepo();
    repo.seed(game("old-finished", "finished", NOW - TTL_MS - 1));
    repo.seed(game("old-cancelled", "cancelled", NOW - TTL_MS - 1));
    // Justo en el límite: `now - createdAt > ttlMs` es estricto, no se poda.
    repo.seed(game("boundary-finished", "finished", NOW - TTL_MS));
    repo.seed(game("recent-finished", "finished", NOW - 1_000));

    expect(await repo.prune()).toBe(2);
    expect(repo.getCached("old-finished")).toBeUndefined();
    expect(repo.getCached("old-cancelled")).toBeUndefined();
    expect(repo.getCached("boundary-finished")).toBeDefined();
    expect(repo.getCached("recent-finished")).toBeDefined();
  });

  it("poda por tope evictando las finalizadas más antiguas", async () => {
    const repo = createRepo({ maxCachedGames: 2 });
    repo.seed(game("finished-1", "finished", NOW - 5_000)); // la más antigua
    repo.seed(game("finished-2", "finished", NOW - 4_000));
    repo.seed(game("finished-3", "finished", NOW - 3_000));
    repo.seed(game("active-old", "active", NOW - 10_000_000)); // nunca se poda
    repo.seed(game("finished-4", "finished", NOW - 2_000));

    expect(await repo.prune()).toBe(3);
    expect(repo.getCached("finished-1")).toBeUndefined();
    expect(repo.getCached("finished-2")).toBeUndefined();
    expect(repo.getCached("finished-3")).toBeUndefined();
    expect(repo.getCached("finished-4")).toBeDefined();
    expect(repo.getCached("active-old")).toBeDefined();
  });

  it("nunca poda partidas waiting/active, aunque excedan el tope", async () => {
    const repo = createRepo({ maxCachedGames: 0 });
    repo.seed(game("active-old", "active", NOW - 10_000_000));
    repo.seed(game("waiting-old", "waiting", NOW - 10_000_000));

    expect(await repo.prune()).toBe(0);
    expect(repo.getCached("active-old")).toBeDefined();
    expect(repo.getCached("waiting-old")).toBeDefined();
  });

  it("es idempotente: el segundo prune no elimina nada", async () => {
    const repo = createRepo();
    repo.seed(game("old-finished", "finished", NOW - TTL_MS - 1));

    expect(await repo.prune()).toBe(1);
    expect(await repo.prune()).toBe(0);
  });
});
