import { describe, expect, it } from "vitest";
import type { Game } from "../../domain/game.js";
import { createWaitingGameExpiryPolicy } from "../../domain/expiry/waiting-game-expiry-policy.js";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { createFixedClock } from "../../../tests/fakes/fixed-clock.js";
import { createInMemoryGameRepository } from "../../../tests/fakes/in-memory-game-repository.js";
import { createRecordingGateway } from "../../../tests/fakes/recording-gateway.js";
import { createCancelStaleGamesUseCase } from "./cancel-stale-games.js";

const BASE_TIME = 1_700_000_000_000;
const EXPIRY_MS = 60 * 60 * 1000;

function setup() {
  const repo = createInMemoryGameRepository();
  const gateway = createRecordingGateway();
  const useCase = createCancelStaleGamesUseCase({
    repo,
    gateway,
    clock: createFixedClock(BASE_TIME),
    policy: createWaitingGameExpiryPolicy(EXPIRY_MS),
    expiryMs: EXPIRY_MS,
  });
  return { repo, gateway, useCase };
}

describe("CancelStaleGames", () => {
  it("cancela las waiting vencidas, emite game-cancelled por cada una y un dashboard", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(
      new GameBuilder()
        .withId("stale-1")
        .withStatus("waiting")
        .withCreatedAt(new Date(BASE_TIME - EXPIRY_MS - 1))
        .build()
    );
    repo.seed(
      new GameBuilder()
        .withId("stale-2")
        .withStatus("waiting")
        .withCreatedAt(new Date(BASE_TIME - EXPIRY_MS - 5000))
        .build()
    );
    repo.seed(
      new GameBuilder()
        .withId("fresh")
        .withStatus("waiting")
        .withCreatedAt(new Date(BASE_TIME - 1000))
        .build()
    );
    repo.seed(
      new GameBuilder()
        .withId("active-vieja")
        .withStatus("active")
        .withCreatedAt(new Date(BASE_TIME - EXPIRY_MS - 1))
        .build()
    );

    await useCase.execute();

    const cancelledEmissions = gateway.emissions.filter((e) => e.event === "game-cancelled");
    expect(cancelledEmissions.map((e) => `${e.kind}:${e.gameId}`)).toEqual([
      "game:stale-1",
      "admins:stale-1",
      "game:stale-2",
      "admins:stale-2",
    ]);
    expect(gateway.emissions.filter((e) => e.event === "update-dashboard")).toHaveLength(1);

    const dashboard = gateway.emissions.find((e) => e.event === "update-dashboard")!;
    const dashboardIds = (dashboard.payload as Game[]).map((g) => g.id);
    expect(dashboardIds).toEqual(expect.arrayContaining(["stale-1", "stale-2", "fresh", "active-vieja"]));

    expect((await repo.findById("stale-1"))!.status).toBe("cancelled");
    expect((await repo.findById("stale-2"))!.status).toBe("cancelled");
    expect((await repo.findById("fresh"))!.status).toBe("waiting");
    expect((await repo.findById("active-vieja"))!.status).toBe("active");
  });

  it("sin partidas vencidas: no emite nada", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(
      new GameBuilder()
        .withId("fresh")
        .withStatus("waiting")
        .withCreatedAt(new Date(BASE_TIME - 1000))
        .build()
    );

    await useCase.execute();

    expect(gateway.emissions).toEqual([]);
  });

  it("una partida active antigua no se cancela (no rompe partidas en curso)", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(
      new GameBuilder()
        .withId("active-vieja")
        .withStatus("active")
        .withCreatedAt(new Date(BASE_TIME - EXPIRY_MS - 1))
        .build()
    );

    await useCase.execute();

    expect(gateway.emissions).toEqual([]);
    expect((await repo.findById("active-vieja"))!.status).toBe("active");
  });
});
