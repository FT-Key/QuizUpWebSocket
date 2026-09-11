import { describe, expect, it } from "vitest";
import type { Game } from "../../domain/game.js";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { PlayerBuilder } from "../../../tests/builders/player-builder.js";
import { createInMemoryGameRepository } from "../../../tests/fakes/in-memory-game-repository.js";
import { createRecordingGateway } from "../../../tests/fakes/recording-gateway.js";
import { createLeaveGameUseCase } from "./leave-game.js";

const GAME_ID = "123456";

function setup() {
  const repo = createInMemoryGameRepository();
  const gateway = createRecordingGateway();
  const useCase = createLeaveGameUseCase({ repo, gateway });
  return { repo, gateway, useCase };
}

describe("LeaveGame", () => {
  it("quita al jugador, sale del room y notifica a admins y sala + dashboard", async () => {
    const { repo, gateway, useCase } = setup();
    const ana = new PlayerBuilder().withId("p-1").withName("Ana").withGameId(GAME_ID).build();
    const luis = new PlayerBuilder().withId("p-2").withName("Luis").withGameId(GAME_ID).build();
    repo.seed(new GameBuilder().withId(GAME_ID).withPlayers(ana, luis).build());

    await useCase.execute({ gameId: GAME_ID, playerId: "p-1", socketId: "s-1" });

    expect(gateway.emissions.map((e) => (e.event ? `${e.kind}:${e.event}` : e.kind))).toEqual([
      "leaveGameRoom",
      "admins:player-left",
      "game:player-left",
      "broadcast:update-dashboard",
    ]);

    const left = gateway.emissions.find((e) => e.event === "player-left")!;
    expect(left.payload).toMatchObject({ playerId: "p-1" });
    expect((left.payload as { game: Game }).game.players.map((p) => p.id)).toEqual(["p-2"]);

    const saved = await repo.findById(GAME_ID);
    expect(saved!.players.map((p) => p.id)).toEqual(["p-2"]);
  });

  it("partida inexistente: solo update-dashboard (paridad legacy), sin emisiones de sala/socket", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(new GameBuilder().withId("999999").build());

    await useCase.execute({ gameId: GAME_ID, playerId: "p-1", socketId: "s-1" });

    expect(
      gateway.emissions.map((e) => (e.event ? `${e.kind}:${e.event}` : e.kind))
    ).toEqual(["broadcast:update-dashboard"]);
    const dashboard = gateway.emissions[0].payload as Game[];
    expect(dashboard.map((g) => g.id)).toEqual(["999999"]);
  });
});
