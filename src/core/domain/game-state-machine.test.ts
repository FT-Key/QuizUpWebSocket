/**
 * Tests de la máquina de estados de partida (US-04).
 *
 * Valores espejo de `src/gameStore.test.ts` (US-01): cada transición reproduce
 * la semántica observable del `gameStore` legacy. `now` entra por parámetro:
 * sin fake timers y sin reloj global.
 */
import { describe, expect, it } from "vitest";
import { GameBuilder } from "../../tests/builders/game-builder.js";
import { PlayerBuilder } from "../../tests/builders/player-builder.js";
import { QuestionBuilder } from "../../tests/builders/question-builder.js";
import {
  canStart,
  cancel,
  finish,
  finishCurrentQuestion,
  lock,
  nextQuestion,
  start,
} from "./game-state-machine.js";

const BASE_TIME = 1_700_000_000_000;

const question = (id: string) => new QuestionBuilder().withId(id).build();

describe("game-state-machine — canStart", () => {
  it("waiting ⇒ true, incluso sin jugadores (paridad con el guard WS, D3)", () => {
    expect(canStart(new GameBuilder().withStatus("waiting").build())).toBe(true);
    expect(
      canStart(
        new GameBuilder()
          .withStatus("waiting")
          .withPlayer(new PlayerBuilder().withName("Ana").build())
          .build()
      )
    ).toBe(true);
  });

  it("active/finished/cancelled ⇒ false", () => {
    expect(canStart(new GameBuilder().withStatus("active").build())).toBe(false);
    expect(canStart(new GameBuilder().withStatus("finished").build())).toBe(false);
    expect(canStart(new GameBuilder().withStatus("cancelled").build())).toBe(false);
  });
});

describe("game-state-machine — start", () => {
  it("waiting ⇒ active, índice 0 y startTime = now, sin tocar questionTimeLimit", () => {
    const game = new GameBuilder()
      .withStatus("waiting")
      .withQuestions(question("q-1"), question("q-2"))
      .withCurrentQuestionIndex(1)
      .withCurrentQuestionStartTime(123)
      .withQuestionTimeLimit(30000)
      .build();

    start(game, BASE_TIME);

    expect(game.status).toBe("active");
    expect(game.currentQuestionIndex).toBe(0);
    expect(game.currentQuestionStartTime).toBe(BASE_TIME);
    expect(game.questionTimeLimit).toBe(30000);
  });

  it("start desde finished ⇒ active (paridad: startGame legacy no valida status)", () => {
    const game = new GameBuilder().withStatus("finished").build();

    start(game, BASE_TIME);

    expect(game.status).toBe("active");
    expect(game.currentQuestionStartTime).toBe(BASE_TIME);
  });
});

describe("game-state-machine — nextQuestion", () => {
  it("con 2 preguntas ⇒ advanced, índice 1, startTime = now y status active", () => {
    const game = new GameBuilder()
      .withStatus("active")
      .withQuestions(question("q-1"), question("q-2"))
      .withCurrentQuestionStartTime(BASE_TIME)
      .build();

    const outcome = nextQuestion(game, BASE_TIME + 1000);

    expect(outcome).toBe("advanced");
    expect(game.currentQuestionIndex).toBe(1);
    expect(game.currentQuestionStartTime).toBe(BASE_TIME + 1000);
    expect(game.status).toBe("active");
  });

  it("en la última ⇒ finished, índice y startTime intactos", () => {
    const game = new GameBuilder()
      .withStatus("active")
      .withQuestions(question("q-1"))
      .withCurrentQuestionStartTime(BASE_TIME)
      .build();

    const outcome = nextQuestion(game, BASE_TIME + 1000);

    expect(outcome).toBe("finished");
    expect(game.status).toBe("finished");
    expect(game.currentQuestionIndex).toBe(0); // no avanza de la última
    expect(game.currentQuestionStartTime).toBe(BASE_TIME); // finish no lo resetea
  });

  it("sin preguntas ⇒ finished", () => {
    const game = new GameBuilder().withStatus("active").build();

    expect(nextQuestion(game, BASE_TIME)).toBe("finished");
    expect(game.status).toBe("finished");
  });
});

describe("game-state-machine — finish", () => {
  it("marca finished sin resetear startTime", () => {
    const game = new GameBuilder()
      .withStatus("active")
      .withCurrentQuestionStartTime(BASE_TIME)
      .build();

    finish(game);

    expect(game.status).toBe("finished");
    expect(game.currentQuestionStartTime).toBe(BASE_TIME);
  });

  it("desde cancelled también ⇒ finished (paridad finishGame sin guard)", () => {
    const game = new GameBuilder().withStatus("cancelled").build();

    finish(game);

    expect(game.status).toBe("finished");
  });
});

describe("game-state-machine — cancel", () => {
  it("waiting ⇒ true + cancelled", () => {
    const game = new GameBuilder().withStatus("waiting").build();

    expect(cancel(game)).toBe(true);
    expect(game.status).toBe("cancelled");
  });

  it("active/finished/cancelled ⇒ false sin mutar", () => {
    const active = new GameBuilder().withStatus("active").build();
    expect(cancel(active)).toBe(false);
    expect(active.status).toBe("active");

    const finished = new GameBuilder().withStatus("finished").build();
    expect(cancel(finished)).toBe(false);
    expect(finished.status).toBe("finished");

    const alreadyCancelled = new GameBuilder().withStatus("cancelled").build();
    expect(cancel(alreadyCancelled)).toBe(false);
    expect(alreadyCancelled.status).toBe("cancelled");
  });
});

describe("game-state-machine — lock", () => {
  it("refleja true/false en game.locked (un lock(false) materializa la clave)", () => {
    const game = new GameBuilder().build();

    lock(game, true);
    expect(game.locked).toBe(true);

    lock(game, false);
    expect(game.locked).toBe(false);
    expect("locked" in game).toBe(true);
  });
});

describe("game-state-machine — finishCurrentQuestion", () => {
  it("resetea currentQuestionStartTime a 0 y deja el status intacto", () => {
    const game = new GameBuilder()
      .withStatus("active")
      .withCurrentQuestionStartTime(BASE_TIME)
      .build();

    finishCurrentQuestion(game);

    expect(game.currentQuestionStartTime).toBe(0);
    expect(game.status).toBe("active");
  });
});
