import { describe, expect, it } from "vitest";
import type { Game } from "../../domain/game.js";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { createInMemoryGameRepository } from "../../../tests/fakes/in-memory-game-repository.js";
import { createRecordingGateway } from "../../../tests/fakes/recording-gateway.js";
import { createCloseGameUseCase } from "./close-game.js";

const GAME_ID = "123456";

function setup() {
  const repo = createInMemoryGameRepository();
  const gateway = createRecordingGateway();
  const useCase = createCloseGameUseCase({ repo, gateway });
  return { repo, gateway, useCase };
}

describe("CloseGame", () => {
  it("waiting → cancelled: persiste, emite game-cancelled a sala + admins y dashboard", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(new GameBuilder().withId(GAME_ID).withStatus("waiting").build());

    await useCase.execute({ gameId: GAME_ID });

    expect((await repo.findById(GAME_ID))!.status).toBe("cancelled");
    expect(gateway.emissions.map((e) => `${e.kind}:${e.event}`)).toEqual([
      "game:game-cancelled",
      "admins:game-cancelled",
      "broadcast:update-dashboard",
    ]);
    const cancelled = gateway.emissions[0].payload as { game: Game };
    expect(cancelled.game.status).toBe("cancelled");
  });

  it("partida no waiting: no-op (guard de cancel)", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(new GameBuilder().withId(GAME_ID).withStatus("active").build());

    await useCase.execute({ gameId: GAME_ID });

    expect((await repo.findById(GAME_ID))!.status).toBe("active");
    expect(gateway.emissions).toEqual([]);
  });
});
