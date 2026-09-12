import { describe, expect, it } from "vitest";
import type { Game } from "../../domain/game.js";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { createInMemoryGameRepository } from "../../../tests/fakes/in-memory-game-repository.js";
import { createRecordingGateway } from "../../../tests/fakes/recording-gateway.js";
import { createEmitDashboardUseCase } from "./emit-dashboard.js";

const BASE_TIME = 1_700_000_000_000;

describe("EmitDashboard", () => {
  it("difunde update-dashboard con las partidas ordenadas createdAt desc", async () => {
    const repo = createInMemoryGameRepository();
    const gateway = createRecordingGateway();
    const useCase = createEmitDashboardUseCase({ repo, gateway });

    repo.seed(new GameBuilder().withId("vieja").withCreatedAt(new Date(BASE_TIME - 2000)).build());
    repo.seed(new GameBuilder().withId("nueva").withCreatedAt(new Date(BASE_TIME)).build());
    repo.seed(new GameBuilder().withId("media").withCreatedAt(new Date(BASE_TIME - 1000)).build());

    await useCase.execute();

    expect(gateway.emissions).toHaveLength(1);
    expect(gateway.emissions[0].kind).toBe("broadcast");
    expect(gateway.emissions[0].event).toBe("update-dashboard");
    expect((gateway.emissions[0].payload as Game[]).map((g) => g.id)).toEqual([
      "nueva",
      "media",
      "vieja",
    ]);
  });
});
