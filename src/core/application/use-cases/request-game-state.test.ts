import { describe, expect, it } from "vitest";
import { createWaitingGameExpiryPolicy } from "../../domain/expiry/waiting-game-expiry-policy.js";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { QuestionBuilder } from "../../../tests/builders/question-builder.js";
import { createFixedClock } from "../../../tests/fakes/fixed-clock.js";
import { createInMemoryGameRepository } from "../../../tests/fakes/in-memory-game-repository.js";
import { createRecordingGateway } from "../../../tests/fakes/recording-gateway.js";
import { createRequestGameStateUseCase } from "./request-game-state.js";

const GAME_ID = "123456";
const BASE_TIME = 1_700_000_000_000;
const EXPIRY_MS = 60 * 60 * 1000;
const QUESTION = new QuestionBuilder().withId("q-1").build();

function setup() {
  const repo = createInMemoryGameRepository();
  const gateway = createRecordingGateway();
  const clock = createFixedClock(BASE_TIME);
  const useCase = createRequestGameStateUseCase({
    repo,
    clock,
    gateway,
    policy: createWaitingGameExpiryPolicy(EXPIRY_MS),
  });
  return { repo, gateway, clock, useCase };
}

describe("RequestGameState", () => {
  it("partida active con pregunta iniciada: responde game-state al socket con timeLeft recortado", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(
      new GameBuilder()
        .withId(GAME_ID)
        .withStatus("active")
        .withQuestions(QUESTION)
        .withCurrentQuestionStartTime(BASE_TIME - 504)
        .build()
    );

    await useCase.execute({ gameId: GAME_ID, socketId: "s-1" });

    expect(gateway.emissions).toHaveLength(1);
    expect(gateway.emissions[0].kind).toBe("socket");
    expect(gateway.emissions[0].socketId).toBe("s-1");
    expect(gateway.emissions[0].event).toBe("game-state");

    const payload = gateway.emissions[0].payload as {
      currentQuestion: { id: string };
      currentQuestionIndex: number;
      timeLeft: number;
    };
    expect(payload.currentQuestion.id).toBe("q-1");
    expect(payload.currentQuestionIndex).toBe(0);
    expect(payload.timeLeft).toBe(19496);
  });

  it("partida waiting no expirada: responde game-state con timeLeft 0 sin cancelar", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(
      new GameBuilder()
        .withId(GAME_ID)
        .withStatus("waiting")
        .withCreatedAt(new Date(BASE_TIME - 1000))
        .withQuestions(QUESTION)
        .build()
    );

    await useCase.execute({ gameId: GAME_ID, socketId: "s-1" });

    expect(gateway.emissions).toHaveLength(1);
    expect((gateway.emissions[0].payload as { timeLeft: number }).timeLeft).toBe(0);
    expect((await repo.findById(GAME_ID))!.status).toBe("waiting");
  });

  it("partida waiting expirada: cancela, emite game-cancelled a sala + admins y luego responde", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(
      new GameBuilder()
        .withId(GAME_ID)
        .withStatus("waiting")
        .withCreatedAt(new Date(BASE_TIME - EXPIRY_MS - 1))
        .withQuestions(QUESTION)
        .build()
    );

    await useCase.execute({ gameId: GAME_ID, socketId: "s-1" });

    expect((await repo.findById(GAME_ID))!.status).toBe("cancelled");
    expect(gateway.emissions.map((e) => `${e.kind}:${e.event}`)).toEqual([
      "game:game-cancelled",
      "admins:game-cancelled",
      "socket:game-state",
    ]);
    const state = gateway.emissions[2].payload as {
      game: { status: string };
      timeLeft: number;
    };
    expect(state.game.status).toBe("cancelled");
    expect(state.timeLeft).toBe(0);
  });

  it("partida inexistente: no-op sin emisiones", async () => {
    const { gateway, useCase } = setup();

    await useCase.execute({ gameId: GAME_ID, socketId: "s-1" });

    expect(gateway.emissions).toEqual([]);
  });
});
