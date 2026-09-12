import { describe, expect, it, vi } from "vitest";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { PlayerBuilder } from "../../../tests/builders/player-builder.js";
import { QuestionBuilder } from "../../../tests/builders/question-builder.js";
import { createFixedClock } from "../../../tests/fakes/fixed-clock.js";
import { createInMemoryGameRepository } from "../../../tests/fakes/in-memory-game-repository.js";
import { createRecordingGateway } from "../../../tests/fakes/recording-gateway.js";
import { createRecordingTimerService } from "../../../tests/fakes/recording-timer-service.js";
import { createNextQuestionUseCase } from "./next-question.js";

const GAME_ID = "123456";
const BASE_TIME = 1_700_000_000_000;
const Q1 = new QuestionBuilder().withId("q-1").build();
const Q2 = new QuestionBuilder().withId("q-2").build();

function setup() {
  const repo = createInMemoryGameRepository();
  const gateway = createRecordingGateway();
  const timers = createRecordingTimerService();
  const forceFinishQuestion = {
    execute: vi.fn(async (_input: { gameId: string }) => {}),
  };
  const useCase = createNextQuestionUseCase({
    repo,
    clock: createFixedClock(BASE_TIME),
    gateway,
    timers,
    forceFinishQuestion,
  });
  return { repo, gateway, timers, forceFinishQuestion, useCase };
}

describe("NextQuestion", () => {
  it("avanza de pregunta: persiste jugadores, reprograma timeout y emite question-changed + dashboard", async () => {
    const { repo, gateway, timers, forceFinishQuestion, useCase } = setup();
    const player = new PlayerBuilder()
      .withId("p-1")
      .withGameId(GAME_ID)
      .withAnswers({ "q-1": 1 })
      .withScore(1950)
      .build();
    repo.seed(
      new GameBuilder()
        .withId(GAME_ID)
        .withStatus("active")
        .withQuestions(Q1, Q2)
        .withPlayers(player)
        .build()
    );
    const persistSpy = vi.spyOn(repo, "updatePlayers");
    const saveSpy = vi.spyOn(repo, "save");

    await useCase.execute({ gameId: GAME_ID });

    // Paridad legacy: `next-question` persiste SOLO jugadores (bulkWrite); el
    // avance de índice/startTime vive en la caché viva, no en un `save`.
    expect(saveSpy).not.toHaveBeenCalled();
    expect((await repo.findById(GAME_ID))!.currentQuestionIndex).toBe(0);
    expect(persistSpy).toHaveBeenCalledWith(GAME_ID, expect.any(Array));

    expect(timers.cleared).toEqual([GAME_ID]);
    expect(timers.scheduled).toHaveLength(1);
    await timers.scheduled[0].onTimeout();
    expect(forceFinishQuestion.execute).toHaveBeenCalledWith({ gameId: GAME_ID });

    expect(gateway.emissions.map((e) => `${e.kind}:${e.event}`)).toEqual([
      "game:question-changed",
      "admins:question-changed",
      "broadcast:update-dashboard",
    ]);
    const payload = gateway.emissions[0].payload as {
      question: { id: string };
      questionIndex: number;
      timeLeft: number;
    };
    expect(payload.question.id).toBe("q-2");
    expect(payload.questionIndex).toBe(1);
    expect(payload.timeLeft).toBe(20000);
  });

  it("en la última pregunta finaliza: game-finished con results y sin question-changed", async () => {
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
        .withQuestions(Q1)
        .withPlayers(player)
        .build()
    );
    const persistSpy = vi.spyOn(repo, "updatePlayers");

    await useCase.execute({ gameId: GAME_ID });

    expect(persistSpy).toHaveBeenCalledWith(GAME_ID, expect.any(Array));
    expect(timers.cleared).toEqual([GAME_ID]);
    expect(timers.scheduled).toEqual([]);

    expect(gateway.emissions.map((e) => `${e.kind}:${e.event}`)).toEqual([
      "game:game-finished",
      "admins:game-finished",
      "broadcast:update-dashboard",
    ]);
    expect(gateway.emissions.some((e) => e.event === "question-changed")).toBe(false);

    const payload = gateway.emissions[0].payload as {
      game: { status: string };
      results: { gameId: string; leaderboard: Array<{ score: number }> };
    };
    expect(payload.game.status).toBe("finished");
    expect(payload.results.gameId).toBe(GAME_ID);
    expect(payload.results.leaderboard[0].score).toBe(2001);
  });

  it("partida inexistente: limpia el timeout y no emite nada", async () => {
    const { gateway, timers, useCase } = setup();

    await useCase.execute({ gameId: GAME_ID });

    expect(timers.cleared).toEqual([GAME_ID]);
    expect(timers.scheduled).toEqual([]);
    expect(gateway.emissions).toEqual([]);
  });
});
