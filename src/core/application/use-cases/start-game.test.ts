import { describe, expect, it, vi } from "vitest";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { QuestionBuilder } from "../../../tests/builders/question-builder.js";
import { createFixedClock } from "../../../tests/fakes/fixed-clock.js";
import { createInMemoryGameRepository } from "../../../tests/fakes/in-memory-game-repository.js";
import { createRecordingGateway } from "../../../tests/fakes/recording-gateway.js";
import { createRecordingTimerService } from "../../../tests/fakes/recording-timer-service.js";
import { createStartGameUseCase } from "./start-game.js";

const GAME_ID = "123456";
const BASE_TIME = 1_700_000_000_000;
const QUESTION = new QuestionBuilder().withId("q-1").build();

function setup() {
  const repo = createInMemoryGameRepository();
  const gateway = createRecordingGateway();
  const timers = createRecordingTimerService();
  const forceFinishQuestion = {
    execute: vi.fn(async (_input: { gameId: string }) => {}),
  };
  const useCase = createStartGameUseCase({
    repo,
    clock: createFixedClock(BASE_TIME),
    gateway,
    timers,
    forceFinishQuestion,
  });
  return { repo, gateway, timers, forceFinishQuestion, useCase };
}

describe("StartGame", () => {
  it("waiting → active, persiste, programa el timeout y emite game-started + dashboard", async () => {
    const { repo, gateway, timers, forceFinishQuestion, useCase } = setup();
    repo.seed(new GameBuilder().withId(GAME_ID).withQuestions(QUESTION).build());

    await useCase.execute({ gameId: GAME_ID });

    const saved = await repo.findById(GAME_ID);
    expect(saved!.status).toBe("active");
    expect(saved!.currentQuestionIndex).toBe(0);
    expect(saved!.currentQuestionStartTime).toBe(BASE_TIME);

    expect(timers.scheduled).toHaveLength(1);
    expect(timers.scheduled[0].gameId).toBe(GAME_ID);
    expect(timers.scheduled[0].delayMs).toBe(20000);
    await timers.scheduled[0].onTimeout();
    expect(forceFinishQuestion.execute).toHaveBeenCalledWith({ gameId: GAME_ID });

    expect(gateway.emissions.map((e) => `${e.kind}:${e.event}`)).toEqual([
      "game:game-started",
      "admins:game-started",
      "broadcast:update-dashboard",
    ]);

    const started = gateway.emissions[0];
    const payload = started.payload as {
      game: { status: string };
      players: unknown[];
      currentQuestion: { id: string };
      timeLeft: number;
    };
    expect(payload.game.status).toBe("active");
    expect(payload.players).toEqual([]);
    expect(payload.currentQuestion.id).toBe("q-1");
    expect(payload.timeLeft).toBe(20000);
  });

  it("partida no waiting: no-op sin persistir, programar ni emitir", async () => {
    const { repo, gateway, timers, useCase } = setup();
    repo.seed(new GameBuilder().withId(GAME_ID).withStatus("active").build());
    const saveSpy = vi.spyOn(repo, "save");

    await useCase.execute({ gameId: GAME_ID });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(timers.scheduled).toEqual([]);
    expect(gateway.emissions).toEqual([]);
  });

  it("partida inexistente: no-op", async () => {
    const { gateway, timers, useCase } = setup();

    await useCase.execute({ gameId: GAME_ID });

    expect(timers.scheduled).toEqual([]);
    expect(gateway.emissions).toEqual([]);
  });
});
