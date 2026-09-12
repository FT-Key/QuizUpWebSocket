import { describe, expect, it, vi } from "vitest";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { PlayerBuilder } from "../../../tests/builders/player-builder.js";
import { QuestionBuilder } from "../../../tests/builders/question-builder.js";
import { createInMemoryGameRepository } from "../../../tests/fakes/in-memory-game-repository.js";
import { createRecordingGateway } from "../../../tests/fakes/recording-gateway.js";
import { createForceFinishQuestionUseCase } from "./force-finish-question.js";

const GAME_ID = "123456";
const START_TIME = 1_700_000_000_000;

function setup() {
  const repo = createInMemoryGameRepository();
  const gateway = createRecordingGateway();
  const useCase = createForceFinishQuestionUseCase({ repo, gateway });
  return { repo, gateway, useCase };
}

function activeGame(startTime = START_TIME) {
  return new GameBuilder()
    .withId(GAME_ID)
    .withStatus("active")
    .withCurrentQuestionStartTime(startTime)
    .withCurrentQuestionIndex(2)
    .withQuestions(
      new QuestionBuilder().withId("q-1").build(),
      new QuestionBuilder().withId("q-2").build(),
      new QuestionBuilder().withId("q-3").build()
    )
    .withPlayers(
      new PlayerBuilder().withId("p-1").withGameId(GAME_ID).withAnswers({ "q-3": 2 }).build()
    )
    .build();
}

describe("ForceFinishQuestion (finish-question / timeout)", () => {
  it("partida active y pregunta iniciada: cierra la pregunta, persiste y emite sin dashboard", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(activeGame());
    const persistSpy = vi.spyOn(repo, "updatePlayers");
    const saveSpy = vi.spyOn(repo, "save");

    await useCase.execute({ gameId: GAME_ID });

    expect(persistSpy).toHaveBeenCalledWith(GAME_ID, expect.any(Array));
    expect(saveSpy).not.toHaveBeenCalled();

    expect(gateway.emissions.map((e) => `${e.kind}:${e.event}`)).toEqual([
      "game:question-finished",
      "admins:question-finished",
      "game:game-updated",
      "admins:game-updated",
    ]);
    expect(gateway.emissions.some((e) => e.event === "update-dashboard")).toBe(false);

    const finished = gateway.emissions[0].payload as { currentQuestionIndex: number };
    expect(finished.currentQuestionIndex).toBe(2);

    const updated = gateway.emissions[2].payload as { game: { currentQuestionStartTime: number } };
    expect(updated.game.currentQuestionStartTime).toBe(0);
  });

  it("partida no active: no-op sin persistir ni emitir", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(
      new GameBuilder()
        .withId(GAME_ID)
        .withStatus("waiting")
        .withCurrentQuestionStartTime(START_TIME)
        .build()
    );
    const persistSpy = vi.spyOn(repo, "updatePlayers");

    await useCase.execute({ gameId: GAME_ID });

    expect(persistSpy).not.toHaveBeenCalled();
    expect(gateway.emissions).toEqual([]);
  });

  it("active pero con currentQuestionStartTime 0: no-op", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(activeGame(0));
    const persistSpy = vi.spyOn(repo, "updatePlayers");

    await useCase.execute({ gameId: GAME_ID });

    expect(persistSpy).not.toHaveBeenCalled();
    expect(gateway.emissions).toEqual([]);
  });

  it("partida inexistente: no-op", async () => {
    const { gateway, useCase } = setup();

    await useCase.execute({ gameId: GAME_ID });

    expect(gateway.emissions).toEqual([]);
  });
});
