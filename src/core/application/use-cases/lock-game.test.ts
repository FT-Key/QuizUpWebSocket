import { describe, expect, it } from "vitest";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { createInMemoryGameRepository } from "../../../tests/fakes/in-memory-game-repository.js";
import { createRecordingGateway } from "../../../tests/fakes/recording-gateway.js";
import { createLockGameUseCase } from "./lock-game.js";

const GAME_ID = "123456";

function setup() {
  const repo = createInMemoryGameRepository();
  const gateway = createRecordingGateway();
  const useCase = createLockGameUseCase({ repo, gateway });
  return { repo, gateway, useCase };
}

describe("LockGame", () => {
  it("persiste el lock y emite game-updated a sala + admins", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(new GameBuilder().withId(GAME_ID).build());

    await useCase.execute({ gameId: GAME_ID, locked: true });

    expect((await repo.findById(GAME_ID))!.locked).toBe(true);
    expect(gateway.emissions.map((e) => `${e.kind}:${e.event}`)).toEqual([
      "game:game-updated",
      "admins:game-updated",
    ]);
    const payload = gateway.emissions[0].payload as { game: { locked: boolean } };
    expect(payload.game.locked).toBe(true);
  });

  it("partida inexistente: no-op sin emisiones", async () => {
    const { gateway, useCase } = setup();

    await useCase.execute({ gameId: GAME_ID, locked: true });

    expect(gateway.emissions).toEqual([]);
  });
});
