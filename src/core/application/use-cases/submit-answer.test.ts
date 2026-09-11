import { describe, expect, it, vi } from "vitest";
import type { Player } from "../../domain/player.js";
import { TimeBonusScoring } from "../../domain/scoring/time-bonus-scoring.js";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { PlayerBuilder } from "../../../tests/builders/player-builder.js";
import { QuestionBuilder } from "../../../tests/builders/question-builder.js";
import { createFixedClock } from "../../../tests/fakes/fixed-clock.js";
import { createInMemoryGameRepository } from "../../../tests/fakes/in-memory-game-repository.js";
import { createRecordingGateway } from "../../../tests/fakes/recording-gateway.js";
import { createSubmitAnswerUseCase } from "./submit-answer.js";

const GAME_ID = "123456";
const BASE_TIME = 1_700_000_000_000;
const QUESTION = new QuestionBuilder().withId("q-1").withCorrectAnswer(1).build();

function makePlayer(id: string, name: string, answers: Record<string, number> = {}): Player {
  return new PlayerBuilder()
    .withId(id)
    .withName(name)
    .withGameId(GAME_ID)
    .withAnswers(answers)
    .withJoinedAt(new Date(BASE_TIME))
    .build();
}

function activeGame(players: Player[] = [makePlayer("p-1", "Ana")]) {
  return new GameBuilder()
    .withId(GAME_ID)
    .withStatus("active")
    .withQuestionTimeLimit(20000)
    .withCurrentQuestionStartTime(BASE_TIME)
    .withQuestions(QUESTION)
    .withPlayers(...players)
    .build();
}

function setup() {
  const repo = createInMemoryGameRepository();
  const gateway = createRecordingGateway();
  const clock = createFixedClock(BASE_TIME);
  const useCase = createSubmitAnswerUseCase({
    repo,
    clock,
    scoring: new TimeBonusScoring(),
    gateway,
  });
  return { repo, gateway, clock, useCase };
}

const submit = (playerId: string, answer: number, socketId = "s-1") => ({
  gameId: GAME_ID,
  playerId,
  questionId: "q-1",
  answer,
  socketId,
});

describe("SubmitAnswer — scoring (espejo de gameStore.test)", () => {
  it("correcta recién iniciada: 1 + floor(20000 / 10) = 2001 y NO persiste", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(activeGame());
    const saveSpy = vi.spyOn(repo, "save");
    const persistSpy = vi.spyOn(repo, "persistPlayers");

    const result = await useCase.execute(submit("p-1", 1));

    expect(result).not.toBeNull();
    expect(result!.player.score).toBe(2001);
    expect(result!.player.answers["q-1"]).toBe(1);
    expect(result!.finishedQuestion).toBe(true);
    expect(result!.game.currentQuestionStartTime).toBe(0);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(persistSpy).not.toHaveBeenCalled();

    const stored = await repo.findById(GAME_ID);
    expect(stored!.players[0].score).toBe(0);
    expect(stored!.players[0].answers).toEqual({});

    expect(gateway.emissions.map((e) => `${e.kind}:${e.event}`)).toEqual([
      "socket:answer-submitted",
      "game:game-updated",
      "admins:game-updated",
      "game:question-finished",
      "admins:question-finished",
    ]);
    expect(gateway.emissions[0].payload).toEqual({
      playerId: "p-1",
      questionId: "q-1",
      answer: 1,
    });
  });

  it("correcta con 504 ms transcurridos: 1950 (trunca el decimal)", async () => {
    const { repo, clock, useCase } = setup();
    repo.seed(activeGame());
    clock.advance(504);

    const result = await useCase.execute(submit("p-1", 1));

    expect(result!.player.score).toBe(1950);
  });

  it("correcta con remaining 0: suma solo 1", async () => {
    const { repo, clock, useCase } = setup();
    repo.seed(activeGame());
    clock.advance(20000);

    const result = await useCase.execute(submit("p-1", 1));

    expect(result!.player.score).toBe(1);
  });

  it("correcta con remaining negativo: suma solo 1", async () => {
    const { repo, clock, useCase } = setup();
    repo.seed(activeGame());
    clock.advance(20001);

    const result = await useCase.execute(submit("p-1", 1));

    expect(result!.player.score).toBe(1);
  });

  it("incorrecta: 0 puntos pero queda registrada como respondida", async () => {
    const { repo, useCase } = setup();
    repo.seed(activeGame());

    const result = await useCase.execute(submit("p-1", 0));

    expect(result!.player.score).toBe(0);
    expect(result!.player.answers["q-1"]).toBe(0);
    expect(result!.finishedQuestion).toBe(true);
  });

  it("CARACTERIZACIÓN: submit sin startGame (waiting, startTime 0) registra y suma 1 sin bonus", async () => {
    // Espejo de gameStore.test.ts:146-158: no hay guard de status ni de
    // currentQuestionStartTime === 0; remaining negativo ⇒ solo el punto base.
    const { repo, useCase } = setup();
    repo.seed(
      new GameBuilder()
        .withId(GAME_ID)
        .withStatus("waiting")
        .withQuestionTimeLimit(20000)
        .withCurrentQuestionStartTime(0)
        .withQuestions(QUESTION)
        .withPlayers(makePlayer("p-1", "Ana"))
        .build()
    );

    const result = await useCase.execute(submit("p-1", 1));

    expect(result).not.toBeNull();
    expect(result!.finishedQuestion).toBe(true);
    expect(result!.game.status).toBe("waiting");
    expect(result!.player.answers["q-1"]).toBe(1);
    expect(result!.player.score).toBe(1);
  });
});

describe("SubmitAnswer — allAnswered", () => {
  it("false mientras queda otro jugador sin responder", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(activeGame([makePlayer("p-1", "Ana"), makePlayer("p-2", "Luis")]));

    const result = await useCase.execute(submit("p-1", 1));

    expect(result!.finishedQuestion).toBe(false);
    expect(result!.game.currentQuestionStartTime).toBe(BASE_TIME);
    expect(gateway.emissions.some((e) => e.event === "question-finished")).toBe(false);
  });

  it("true cuando responde el último y deja currentQuestionStartTime en 0", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(
      activeGame([
        makePlayer("p-1", "Ana", { "q-1": 1 }),
        makePlayer("p-2", "Luis"),
      ])
    );

    const result = await useCase.execute(submit("p-2", 1));

    expect(result!.finishedQuestion).toBe(true);
    expect(result!.game.currentQuestionStartTime).toBe(0);
    expect(result!.game.players.find((p) => p.id === "p-1")!.score).toBe(0);
    expect(gateway.emissions.filter((e) => e.event === "question-finished")).toHaveLength(2);
  });

  it("CARACTERIZACIÓN: re-responder vuelve a sumar 1 sin bonus (bug congelado)", async () => {
    const { repo, clock, useCase } = setup();
    repo.seed(activeGame());

    const first = await useCase.execute(submit("p-1", 1));
    expect(first!.player.score).toBe(2001);

    // El fake devuelve copias; se re-siembra el estado mutado como haría la
    // caché viva del adaptador Mongo entre dos submits (el use case no persiste).
    repo.seed(first!.game);
    clock.advance(1000);

    const second = await useCase.execute(submit("p-1", 1));

    expect(second!.finishedQuestion).toBe(true);
    expect(second!.player.score).toBe(2002);
  });

  it("CARACTERIZACIÓN: re-responder incorrecto sobrescribe y no resta", async () => {
    const { repo, clock, useCase } = setup();
    repo.seed(activeGame());

    const first = await useCase.execute(submit("p-1", 1));
    repo.seed(first!.game);
    clock.advance(1000);

    const second = await useCase.execute(submit("p-1", 0));

    expect(second!.player.answers["q-1"]).toBe(0);
    expect(second!.player.score).toBe(2001);
  });
});

describe("SubmitAnswer — no-op", () => {
  it("jugador inexistente: null sin emisiones", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(activeGame());

    const result = await useCase.execute(submit("p-inexistente", 1));

    expect(result).toBeNull();
    expect(gateway.emissions).toEqual([]);
  });

  it("pregunta inexistente: null sin emisiones ni mutaciones", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(activeGame());

    const result = await useCase.execute({
      gameId: GAME_ID,
      playerId: "p-1",
      questionId: "q-inexistente",
      answer: 1,
      socketId: "s-1",
    });

    expect(result).toBeNull();
    expect(gateway.emissions).toEqual([]);
    const stored = await repo.findById(GAME_ID);
    expect(stored!.players[0].score).toBe(0);
    expect(stored!.players[0].answers).toEqual({});
  });
});
