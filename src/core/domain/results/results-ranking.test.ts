/**
 * Test ROJO pre-fix de US-20 (H2) — `leaderboard` sin ordenar.
 *
 * Reproduce el reporte real de una partida de 2 jugadores: el de 0 pts quedó 1°
 * y el de 2336 pts 2°, porque el `leaderboard` se construye con
 * `game.players.map(...)` en orden de inserción y nunca se ordena.
 *
 * Contra el código actual (sin sort) este archivo FALLA a propósito; la
 * implementación de US-20 (orden por `score` descendente) debe ponerlo verde.
 * No usa campos nuevos: solo `Player`/`Game` vigentes.
 */
import { describe, expect, it } from "vitest";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { PlayerBuilder } from "../../../tests/builders/player-builder.js";
import { QuestionBuilder } from "../../../tests/builders/question-builder.js";
import { calculateResults } from "./results-calculator.js";

describe("results-calculator — ranking (US-20, rojo pre-fix)", () => {
  it("2 jugadores [0, 2336] en orden de inserción ⇒ leaderboard [2336, 0] (score desc)", () => {
    const game = new GameBuilder()
      .withId("123456")
      .withQuestions(
        new QuestionBuilder().withId("q-1").withCorrectAnswer(1).build()
      )
      .withPlayer(
        new PlayerBuilder()
          .withId("p-franco")
          .withName("Franco")
          .withAnswers({})
          .withScore(0)
          .build()
      )
      .withPlayer(
        new PlayerBuilder()
          .withId("p-mel")
          .withName("Mel")
          .withAnswers({ "q-1": 1 })
          .withScore(2336)
          .build()
      )
      .build();

    const leaderboard = calculateResults(game).leaderboard;

    expect(leaderboard.map((entry) => entry.name)).toEqual(["Mel", "Franco"]);
    expect(leaderboard.map((entry) => entry.score)).toEqual([2336, 0]);
  });
});
