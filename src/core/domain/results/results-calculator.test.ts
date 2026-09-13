/**
 * Tests de `calculateResults` (US-04).
 *
 * Los valores por defecto espejan `gameStore.getGameResults` (US-01): percentage
 * crudo (66.666…), `avatar` siempre como clave, sin `questionResults` ni
 * `averageScore` salvo bandera. La semántica de las banderas espeja la ruta REST
 * de Next (`app/api/games/[gameId]/results/route.ts`).
 */
import { describe, expect, it } from "vitest";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { PlayerBuilder } from "../../../tests/builders/player-builder.js";
import { QuestionBuilder } from "../../../tests/builders/question-builder.js";
import { calculateResults } from "./results-calculator.js";

const BASE_TIME = 1_700_000_000_000;

const question = (id: string, correctAnswer: number, text = `Pregunta ${id}`) =>
  new QuestionBuilder().withId(id).withText(text).withCorrectAnswer(correctAnswer).build();

describe("results-calculator — paridad por defecto con gameStore.getGameResults", () => {
  it("3 preguntas, 2 aciertos y 1 fallo ⇒ percentage crudo 66.66666666666666", () => {
    const game = new GameBuilder()
      .withId("game-1")
      .withCreatedAt(new Date(BASE_TIME))
      .withQuestions(question("q-1", 1), question("q-2", 2), question("q-3", 0))
      .withPlayer(
        new PlayerBuilder()
          .withId("player-1")
          .withName("Ana")
          .withAnswers({ "q-1": 1, "q-2": 2, "q-3": 1 })
          .withScore(4002)
          .build()
      )
      .build();

    const results = calculateResults(game);

    expect(results.gameId).toBe("game-1");
    expect(results.createdAt.getTime()).toBe(BASE_TIME);
    expect(results.totalPlayers).toBe(1);
    expect(results.totalQuestions).toBe(3);
    expect(results.leaderboard).toHaveLength(1);
    expect(results.leaderboard[0].playerId).toBe("player-1");
    expect(results.leaderboard[0].name).toBe("Ana");
    expect(results.leaderboard[0].score).toBe(4002);
    expect(results.leaderboard[0].correctAnswers).toBe(2);
    expect(results.leaderboard[0].totalQuestions).toBe(3);
    expect(results.leaderboard[0].percentage).toBe(66.66666666666666);
    expect(results.leaderboard[0].avatar).toBeUndefined();
    expect("avatar" in results.leaderboard[0]).toBe(true);
  });

  it("por defecto no existen las claves questionResults ni averageScore", () => {
    const game = new GameBuilder().withQuestions(question("q-1", 1)).build();

    const results = calculateResults(game);

    expect("questionResults" in results).toBe(false);
    expect("averageScore" in results).toBe(false);
  });

  it("0 preguntas ⇒ totalQuestions 0 y percentage 0 (sin división por cero)", () => {
    const game = new GameBuilder()
      .withPlayer(new PlayerBuilder().withName("Ana").build())
      .build();

    const results = calculateResults(game);

    expect(results.totalQuestions).toBe(0);
    expect(results.leaderboard[0].correctAnswers).toBe(0);
    expect(results.leaderboard[0].percentage).toBe(0);
  });

  it("jugador sin respuestas: entrada exacta del leaderboard (percentage 0 y clave avatar presente)", () => {
    const game = new GameBuilder()
      .withQuestions(question("q-1", 1))
      .withPlayer(
        new PlayerBuilder().withId("player-1").withName("Franco").withScore(0).build()
      )
      .build();

    const results = calculateResults(game);

    expect(results.leaderboard).toEqual([
      {
        playerId: "player-1",
        name: "Franco",
        score: 0,
        correctAnswers: 0,
        totalQuestions: 1,
        percentage: 0,
        avatar: undefined,
      },
    ]);
    // `toEqual` ignora claves con valor `undefined`: se congela el set exacto de claves.
    expect(Object.keys(results.leaderboard[0]).sort()).toEqual([
      "avatar",
      "correctAnswers",
      "name",
      "percentage",
      "playerId",
      "score",
      "totalQuestions",
    ]);
  });

  it("sin jugadores ⇒ leaderboard [] y totalPlayers 0; averageScore con bandera ⇒ 0", () => {
    const game = new GameBuilder().withQuestions(question("q-1", 1)).build();

    const results = calculateResults(game, { includeAverageScore: true });

    expect(results.leaderboard).toEqual([]);
    expect(results.totalPlayers).toBe(0);
    expect(results.averageScore).toBe(0);
  });
});

describe("results-calculator — includeQuestionResults", () => {
  it("sin responder ⇒ answer -1 e isCorrect false; incorrecta ⇒ answer real e isCorrect false", () => {
    const game = new GameBuilder()
      .withQuestions(question("q-1", 1), question("q-2", 2))
      .withPlayer(
        new PlayerBuilder()
          .withId("player-1")
          .withName("Ana")
          .withAnswer("q-1", 2) // incorrecta (era 1); q-2 sin responder
          .build()
      )
      .withPlayer(
        new PlayerBuilder()
          .withId("player-2")
          .withName("Luis")
          .withAnswers({ "q-1": 1, "q-2": 2 })
          .build()
      )
      .build();

    const results = calculateResults(game, { includeQuestionResults: true });

    expect(results.questionResults).toHaveLength(2);
    expect(results.questionResults![0].playerAnswers[0]).toEqual({
      playerId: "player-1",
      name: "Ana",
      answer: 2,
      isCorrect: false,
    });
    expect(results.questionResults![0].playerAnswers[1]).toEqual({
      playerId: "player-2",
      name: "Luis",
      answer: 1,
      isCorrect: true,
    });
    expect(results.questionResults![1].playerAnswers[0]).toEqual({
      playerId: "player-1",
      name: "Ana",
      answer: -1,
      isCorrect: false,
    });
    expect(results.questionResults![1].playerAnswers[1]).toEqual({
      playerId: "player-2",
      name: "Luis",
      answer: 2,
      isCorrect: true,
    });
  });

  it("respeta el orden preguntas × jugadores y copia texto/respuesta correcta", () => {
    const game = new GameBuilder()
      .withQuestions(
        question("q-1", 1, "¿Uno?"),
        question("q-2", 2, "¿Dos?")
      )
      .withPlayer(new PlayerBuilder().withId("player-1").withName("Ana").build())
      .withPlayer(new PlayerBuilder().withId("player-2").withName("Luis").build())
      .build();

    const results = calculateResults(game, { includeQuestionResults: true });

    expect(results.questionResults!.map((q) => q.questionId)).toEqual(["q-1", "q-2"]);
    expect(results.questionResults![0].questionText).toBe("¿Uno?");
    expect(results.questionResults![0].correctAnswer).toBe(1);
    expect(results.questionResults![1].questionText).toBe("¿Dos?");
    expect(results.questionResults![1].correctAnswer).toBe(2);
    expect(results.questionResults![0].playerAnswers.map((a) => a.playerId)).toEqual([
      "player-1",
      "player-2",
    ]);
    expect(results.questionResults![1].playerAnswers.map((a) => a.name)).toEqual([
      "Ana",
      "Luis",
    ]);
  });

  it("sin preguntas ⇒ questionResults [] con la bandera activa", () => {
    const game = new GameBuilder()
      .withPlayer(new PlayerBuilder().withId("player-1").withName("Ana").build())
      .build();

    const results = calculateResults(game, { includeQuestionResults: true });

    expect(results.questionResults).toEqual([]);
  });
});

describe("results-calculator — orden del leaderboard (US-20)", () => {
  it("ordena por score desc aunque el orden de inserción sea el inverso", () => {
    const game = new GameBuilder()
      .withId("game-1")
      .withQuestions(question("q-1", 1))
      .withPlayer(
        new PlayerBuilder()
          .withId("p-beto")
          .withName("Beto")
          .withAnswers({ "q-1": 0 })
          .withScore(100)
          .build()
      )
      .withPlayer(
        new PlayerBuilder()
          .withId("p-ana")
          .withName("Ana")
          .withAnswers({ "q-1": 1 })
          .withScore(101)
          .build()
      )
      .build();

    const results = calculateResults(game);

    expect(results.leaderboard.map((entry) => entry.playerId)).toEqual(["p-ana", "p-beto"]);
  });

  it("empate en score: desempata por totalTimeMs asc y emite la clave", () => {
    const game = new GameBuilder()
      .withId("game-1")
      .withQuestionTimeLimit(20_000)
      .withQuestions(question("q-1", 1))
      .withPlayers(
        {
          ...new PlayerBuilder().withId("p-slow").withName("Slow").withScore(500).build(),
          answerTimesMs: { "q-1": 8000 },
        },
        {
          ...new PlayerBuilder().withId("p-fast").withName("Fast").withScore(500).build(),
          answerTimesMs: { "q-1": 2000 },
        }
      )
      .build();

    const leaderboard = calculateResults(game).leaderboard;

    expect(leaderboard.map((entry) => entry.playerId)).toEqual(["p-fast", "p-slow"]);
    expect(leaderboard.map((entry) => entry.totalTimeMs)).toEqual([2000, 8000]);
  });

  it("legacy sin answerTimesMs: omite la clave y cae a joinedAt asc", () => {
    const joinedBase = 1_700_000_000_000;
    const game = new GameBuilder()
      .withId("game-1")
      .withPlayers(
        new PlayerBuilder()
          .withId("p-late")
          .withName("Late")
          .withScore(500)
          .withJoinedAt(new Date(joinedBase + 1000))
          .build(),
        new PlayerBuilder()
          .withId("p-early")
          .withName("Early")
          .withScore(500)
          .withJoinedAt(new Date(joinedBase))
          .build()
      )
      .build();

    const leaderboard = calculateResults(game).leaderboard;

    expect(leaderboard.map((entry) => entry.playerId)).toEqual(["p-early", "p-late"]);
    expect(leaderboard.every((entry) => !("totalTimeMs" in entry))).toBe(true);
  });
});

describe("results-calculator — includeAverageScore y casos borde", () => {
  it("averageScore = suma / (n || 1) sin redondear: 2 jugadores ⇒ 1000.5", () => {
    const game = new GameBuilder()
      .withPlayer(new PlayerBuilder().withId("player-1").withScore(1000).build())
      .withPlayer(new PlayerBuilder().withId("player-2").withScore(1001).build())
      .build();

    const results = calculateResults(game, { includeAverageScore: true });

    expect(results.averageScore).toBe(1000.5);
  });

  it("respuestas a questionId desconocido no cuentan como aciertos", () => {
    const game = new GameBuilder()
      .withQuestions(question("q-1", 1))
      .withPlayer(new PlayerBuilder().withAnswers({ "q-fantasma": 1 }).build())
      .build();

    const results = calculateResults(game);

    expect(results.leaderboard[0].correctAnswers).toBe(0);
    expect(results.leaderboard[0].percentage).toBe(0);
  });

  it("avatar se propaga cuando existe", () => {
    const avatar = { seed: "ana", accessories: ["hat"] };
    const game = new GameBuilder()
      .withPlayer(new PlayerBuilder().withName("Ana").withAvatar(avatar).build())
      .build();

    const results = calculateResults(game);

    expect(results.leaderboard[0].avatar).toEqual(avatar);
  });

  it("no muta el Game de entrada (con ambas banderas activas)", () => {
    const game = new GameBuilder()
      .withId("game-1")
      .withCreatedAt(new Date(BASE_TIME))
      .withQuestions(question("q-1", 1), question("q-2", 2))
      .withPlayer(
        new PlayerBuilder()
          .withId("player-1")
          .withName("Ana")
          .withAnswer("q-1", 1)
          .withScore(2001)
          .build()
      )
      .build();
    const snapshot = structuredClone(game);

    calculateResults(game, { includeQuestionResults: true, includeAverageScore: true });

    expect(game).toEqual(snapshot);
  });
});
