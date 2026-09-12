import { describe, expect, it, vi } from "vitest";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { PlayerBuilder } from "../../../tests/builders/player-builder.js";
import { QuestionBuilder } from "../../../tests/builders/question-builder.js";
import { createInMemoryGameRepository } from "../../../tests/fakes/in-memory-game-repository.js";
import { createRecordingGateway } from "../../../tests/fakes/recording-gateway.js";
import { createRecordingTimerService } from "../../../tests/fakes/recording-timer-service.js";
import { createFinishGameUseCase } from "./finish-game.js";

const GAME_ID = "123456";

function setup() {
  const repo = createInMemoryGameRepository();
  const gateway = createRecordingGateway();
  const timers = createRecordingTimerService();
  const useCase = createFinishGameUseCase({ repo, gateway, timers });
  return { repo, gateway, timers, useCase };
}

describe("FinishGame", () => {
  it("marca finished, persiste jugadores y estado, y emite game-finished + dashboard", async () => {
    const { repo, gateway, timers, useCase } = setup();
    const player = new PlayerBuilder()
      .withId("p-1")
      .withGameId(GAME_ID)
      .withAnswers({ "q-1": 1 })
      .withScore(2001)
      .build();
    repo.seed(
      new GameBuilder()
        .withId(GAME_ID)
        .withStatus("active")
        .withQuestions(new QuestionBuilder().withId("q-1").withCorrectAnswer(1).build())
        .withPlayers(player)
        .build()
    );
    const persistSpy = vi.spyOn(repo, "updatePlayers");
    const saveSpy = vi.spyOn(repo, "save");

    await useCase.execute({ gameId: GAME_ID });

    expect(timers.cleared).toEqual([GAME_ID]);
    expect(persistSpy).toHaveBeenCalledWith(GAME_ID, expect.any(Array));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect((await repo.findById(GAME_ID))!.status).toBe("finished");

    expect(gateway.emissions.map((e) => `${e.kind}:${e.event}`)).toEqual([
      "game:game-finished",
      "admins:game-finished",
      "broadcast:update-dashboard",
    ]);
    const payload = gateway.emissions[0].payload as {
      game: { status: string };
      results: { gameId: string; leaderboard: Array<{ correctAnswers: number }> };
    };
    expect(payload.game.status).toBe("finished");
    expect(payload.results.gameId).toBe(GAME_ID);
    expect(payload.results.leaderboard[0].correctAnswers).toBe(1);
  });

  it("partida inexistente: limpia el timeout y no emite nada", async () => {
    const { gateway, timers, useCase } = setup();

    await useCase.execute({ gameId: GAME_ID });

    expect(timers.cleared).toEqual([GAME_ID]);
    expect(gateway.emissions).toEqual([]);
  });
});
