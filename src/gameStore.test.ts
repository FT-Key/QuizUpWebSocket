/**
 * Tests de caracterización de `gameStore` (US-01 — red de seguridad).
 *
 * Congelan el comportamiento observable ACTUAL del store antes del refactor
 * hexagonal (US-04+). No deben modificarse durante el refactor salvo cambio
 * intencional declarado en la US correspondiente.
 *
 * Fuente de las reglas congeladas: docs/03-CONTRACTS.md > "Reglas de puntuación
 * (congeladas)" y QuizUpWebSocket/src/gameStore.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameStore } from "./gameStore.js";
import { DEFAULT_TIME_LIMIT_MS } from "./constants/game.js";
import type { Game, Player } from "./types/types.js";

const BASE_TIME = 1_700_000_000_000;

const makeQuestions = (correctAnswers: number[]) =>
  correctAnswers.map((correctAnswer, index) => ({
    text: `Pregunta ${index + 1}`,
    options: ["A", "B", "C", "D"] as [string, string, string, string],
    correctAnswer,
  }));

function createGame(correctAnswers: number[] = [1]): Game {
  return gameStore.createGame(
    { name: "Partida de caracterización", questions: makeQuestions(correctAnswers) },
    "creator-1"
  );
}

function addPlayer(gameId: string, name: string): Player {
  const player = gameStore.addPlayer(gameId, name);
  if (!player) throw new Error(`No se pudo agregar el jugador a la partida ${gameId}`);
  return player;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("gameStore — scoring (1 + floor(remainingMs / 10))", () => {
  it("una respuesta correcta recién iniciada la pregunta suma 1 + bonus completo (2000)", () => {
    const game = createGame([1]);
    const player = addPlayer(game.id, "Ana");
    gameStore.startGame(game.id);

    const result = gameStore.submitAnswer(player.id, game.questions[0].id, 1);

    expect(result).toEqual({ finishedQuestion: true });
    expect(player.answers[game.questions[0].id]).toBe(1);
    expect(player.score).toBe(2001); // 1 + floor(20000 / 10)
  });

  it("una respuesta correcta con 504 ms transcurridos suma 1 + floor(19496 / 10), truncando el decimal", () => {
    const game = createGame([1]);
    const player = addPlayer(game.id, "Ana");
    gameStore.startGame(game.id);
    vi.advanceTimersByTime(504);

    gameStore.submitAnswer(player.id, game.questions[0].id, 1);

    expect(player.score).toBe(1950); // 1 + floor(1949.6) = 1 + 1949
  });

  it("una respuesta correcta justo al agotarse el tiempo (remainingMs = 0) suma solo 1", () => {
    const game = createGame([1]);
    const player = addPlayer(game.id, "Ana");
    gameStore.startGame(game.id);
    vi.advanceTimersByTime(DEFAULT_TIME_LIMIT_MS);

    gameStore.submitAnswer(player.id, game.questions[0].id, 1);

    expect(player.score).toBe(1); // el bonus exige remainingMs > 0
  });

  it("una respuesta correcta después del límite (remainingMs < 0) suma solo 1", () => {
    const game = createGame([1]);
    const player = addPlayer(game.id, "Ana");
    gameStore.startGame(game.id);
    vi.advanceTimersByTime(DEFAULT_TIME_LIMIT_MS + 1);

    gameStore.submitAnswer(player.id, game.questions[0].id, 1);

    expect(player.score).toBe(1);
  });

  it("una respuesta incorrecta suma 0 pero queda registrada como respondida", () => {
    const game = createGame([1]);
    const player = addPlayer(game.id, "Ana");
    gameStore.startGame(game.id);

    const result = gameStore.submitAnswer(player.id, game.questions[0].id, 0);

    expect(result).toEqual({ finishedQuestion: true });
    expect(player.answers[game.questions[0].id]).toBe(0);
    expect(player.score).toBe(0);
  });

  it("un jugador que no responde se queda con 0 puntos", () => {
    const game = createGame([1]);
    const player = addPlayer(game.id, "Ana");
    gameStore.startGame(game.id);

    expect(player.answers).toEqual({});
    expect(player.score).toBe(0);
  });

  it("CARACTERIZACIÓN: re-responder correctamente vuelve a sumar 1 punto (no hay protección de duplicados)", () => {
    // Bug conocido: submitAnswer no rechaza respuestas repetidas; solo bloquea
    // el bonus porque finishCurrentQuestion deja currentQuestionStartTime = 0.
    const game = createGame([1]);
    const player = addPlayer(game.id, "Ana");
    gameStore.startGame(game.id);

    gameStore.submitAnswer(player.id, game.questions[0].id, 1);
    expect(player.score).toBe(2001);

    vi.advanceTimersByTime(1000);
    const result = gameStore.submitAnswer(player.id, game.questions[0].id, 1);

    expect(result).toEqual({ finishedQuestion: true });
    expect(player.score).toBe(2002); // +1 base otra vez, sin bonus
  });

  it("CARACTERIZACIÓN: re-responder con una opción incorrecta sobrescribe la respuesta y no resta puntos", () => {
    const game = createGame([1]);
    const player = addPlayer(game.id, "Ana");
    gameStore.startGame(game.id);

    gameStore.submitAnswer(player.id, game.questions[0].id, 1);
    expect(player.score).toBe(2001);

    vi.advanceTimersByTime(1000);
    gameStore.submitAnswer(player.id, game.questions[0].id, 0);

    expect(player.answers[game.questions[0].id]).toBe(0);
    expect(player.score).toBe(2001);
  });

  it("CARACTERIZACIÓN: submitAnswer no valida el estado ni que la pregunta haya iniciado (da el punto base en waiting)", () => {
    // El store no consulta game.status ni currentQuestionStartTime === 0:
    // un submit antes de startGame registra la respuesta y suma 1 sin bonus.
    const game = createGame([1]);
    const player = addPlayer(game.id, "Ana");

    const result = gameStore.submitAnswer(player.id, game.questions[0].id, 1);

    expect(result).toEqual({ finishedQuestion: true });
    expect(game.status).toBe("waiting");
    expect(player.answers[game.questions[0].id]).toBe(1);
    expect(player.score).toBe(1);
  });
});

describe("gameStore — allAnswered", () => {
  it("allAnswered es false hasta que responde el último jugador y true cuando todos responden", () => {
    const game = createGame([1]);
    const ana = addPlayer(game.id, "Ana");
    const luis = addPlayer(game.id, "Luis");
    gameStore.startGame(game.id);

    const first = gameStore.submitAnswer(ana.id, game.questions[0].id, 1);

    expect(first).toEqual({ finishedQuestion: false });
    expect(game.currentQuestionStartTime).toBe(BASE_TIME);

    const second = gameStore.submitAnswer(luis.id, game.questions[0].id, 1);

    expect(second).toEqual({ finishedQuestion: true });
    expect(game.currentQuestionStartTime).toBe(0);
    expect(ana.score).toBe(2001);
    expect(luis.score).toBe(2001);
  });

  it("una respuesta incorrecta también cuenta como respondida para allAnswered", () => {
    const game = createGame([1]);
    const ana = addPlayer(game.id, "Ana");
    const luis = addPlayer(game.id, "Luis");
    gameStore.startGame(game.id);

    expect(gameStore.submitAnswer(ana.id, game.questions[0].id, 0)).toEqual({ finishedQuestion: false });
    expect(gameStore.submitAnswer(luis.id, game.questions[0].id, 3)).toEqual({ finishedQuestion: true });
    expect(ana.score).toBe(0);
    expect(luis.score).toBe(0);
  });

  it("submitAnswer devuelve false si el jugador no existe", () => {
    const game = createGame([1]);

    expect(gameStore.submitAnswer("jugador-inexistente", game.questions[0].id, 1)).toBe(false);
  });

  it("submitAnswer devuelve false si la pregunta no existe y no modifica el estado", () => {
    const game = createGame([1]);
    const player = addPlayer(game.id, "Ana");
    gameStore.startGame(game.id);

    expect(gameStore.submitAnswer(player.id, "pregunta-inexistente", 1)).toBe(false);
    expect(player.answers).toEqual({});
    expect(player.score).toBe(0);
  });
});

describe("gameStore — transiciones de estado", () => {
  it("createGame crea la partida en waiting, índice 0, startTime 0 y límite por defecto de 20000 ms", () => {
    const game = createGame([1]);

    expect(game.status).toBe("waiting");
    expect(game.currentQuestionIndex).toBe(0);
    expect(game.currentQuestionStartTime).toBe(0);
    expect(game.questionTimeLimit).toBe(DEFAULT_TIME_LIMIT_MS);
    expect(game.questionTimeLimit).toBe(20000);
    expect(game.players).toEqual([]);
    expect(game.creatorId).toBe("creator-1");
    expect(game.name).toBe("Partida de caracterización");
    expect(game.createdAt.getTime()).toBe(BASE_TIME);
    expect(game.locked).toBeUndefined();

    const question = game.questions[0];
    expect(typeof question.id).toBe("string");
    expect(question.id.length).toBeGreaterThan(0);
    expect(question.image).toBeNull();
  });

  it("startGame pone la partida active, reinicia el índice y fija currentQuestionStartTime al ahora", () => {
    const game = createGame([1]);
    vi.advanceTimersByTime(5000);

    expect(gameStore.startGame(game.id)).toBe(true);

    expect(game.status).toBe("active");
    expect(game.currentQuestionIndex).toBe(0);
    expect(game.currentQuestionStartTime).toBe(BASE_TIME + 5000);
  });

  it("startGame devuelve false si la partida no existe", () => {
    expect(gameStore.startGame("partida-inexistente")).toBe(false);
  });

  it("nextQuestion avanza índice y startTime y devuelve true si quedan preguntas", () => {
    const game = createGame([1, 2]);
    gameStore.startGame(game.id);
    vi.advanceTimersByTime(1000);

    expect(gameStore.nextQuestion(game.id)).toBe(true);

    expect(game.currentQuestionIndex).toBe(1);
    expect(game.currentQuestionStartTime).toBe(BASE_TIME + 1000);
    expect(game.status).toBe("active");
  });

  it("nextQuestion en la última pregunta finaliza la partida y devuelve false", () => {
    const game = createGame([1]);
    gameStore.startGame(game.id);
    vi.advanceTimersByTime(1000);

    expect(gameStore.nextQuestion(game.id)).toBe(false);

    expect(game.status).toBe("finished");
    expect(game.currentQuestionIndex).toBe(0); // no avanza de la última
    expect(game.currentQuestionStartTime).toBe(BASE_TIME); // finishGame no lo resetea
  });

  it("finishGame marca la partida como finished y devuelve false si no existe", () => {
    const game = createGame([1]);

    expect(gameStore.finishGame(game.id)).toBe(true);
    expect(game.status).toBe("finished");
    expect(gameStore.finishGame("partida-inexistente")).toBe(false);
  });

  it("cancelGame solo cancela partidas en waiting", () => {
    const waiting = createGame([1]);
    const active = createGame([1]);
    gameStore.startGame(active.id);

    expect(gameStore.cancelGame(waiting.id)).toBe(true);
    expect(waiting.status).toBe("cancelled");

    // Ya cancelada: el guard es status !== "waiting".
    expect(gameStore.cancelGame(waiting.id)).toBe(false);
    expect(gameStore.cancelGame(active.id)).toBe(false);
    expect(active.status).toBe("active");
    expect(gameStore.cancelGame("partida-inexistente")).toBe(false);
  });

  it("finishCurrentQuestion resetea currentQuestionStartTime a 0 y devuelve false si no existe", () => {
    const game = createGame([1]);
    gameStore.startGame(game.id);
    vi.advanceTimersByTime(1000);

    expect(gameStore.finishCurrentQuestion(game.id)).toBe(true);
    expect(game.currentQuestionStartTime).toBe(0);
    expect(gameStore.finishCurrentQuestion("partida-inexistente")).toBe(false);
  });
});

describe("gameStore — getGameResults (percentage del contrato, sin redondear)", () => {
  it("CARACTERIZACIÓN: percentage = correctAnswers / totalQuestions * 100 sin redondear", () => {
    // Contrato v1.0.0: en WS el percentage sale crudo (66.666...); la ruta REST
    // de Next es la que redondea al presentar resultados.
    const game = createGame([1, 2, 0]);
    const player = addPlayer(game.id, "Ana");
    gameStore.startGame(game.id);

    gameStore.submitAnswer(player.id, game.questions[0].id, 1); // correcta
    gameStore.nextQuestion(game.id);
    gameStore.submitAnswer(player.id, game.questions[1].id, 2); // correcta
    gameStore.nextQuestion(game.id);
    gameStore.submitAnswer(player.id, game.questions[2].id, 1); // incorrecta (era 0)

    const results = gameStore.getGameResults(game.id);

    expect(results).not.toBeNull();
    expect(results!.gameId).toBe(game.id);
    expect(results!.createdAt.getTime()).toBe(BASE_TIME);
    expect(results!.totalPlayers).toBe(1);
    expect(results!.totalQuestions).toBe(3);
    expect(results!.leaderboard).toHaveLength(1);
    expect(results!.leaderboard[0].playerId).toBe(player.id);
    expect(results!.leaderboard[0].name).toBe("Ana");
    expect(results!.leaderboard[0].score).toBe(4002); // 2001 + 2001 (+0 por la incorrecta)
    expect(results!.leaderboard[0].correctAnswers).toBe(2);
    expect(results!.leaderboard[0].totalQuestions).toBe(3);
    expect(results!.leaderboard[0].percentage).toBe(66.66666666666666); // (2 / 3) * 100, crudo
    expect(results!.leaderboard[0].avatar).toBeUndefined();
    expect("questionResults" in results!).toBe(false);
    expect("averageScore" in results!).toBe(false);
  });

  it("getGameResults devuelve null si la partida no existe", () => {
    expect(gameStore.getGameResults("partida-inexistente")).toBeNull();
  });

  it("con 0 preguntas el percentage es 0 (evita la división por cero)", () => {
    const game = createGame([]);
    addPlayer(game.id, "Ana");

    const results = gameStore.getGameResults(game.id);

    expect(results!.totalQuestions).toBe(0);
    expect(results!.leaderboard[0].correctAnswers).toBe(0);
    expect(results!.leaderboard[0].percentage).toBe(0);
  });
});
