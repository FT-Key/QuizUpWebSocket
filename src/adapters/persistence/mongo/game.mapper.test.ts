/**
 * Tests del mapper doc ↔ dominio (US-05).
 *
 * Congelan la paridad 1:1 con el `buildGame` legacy (`socket/helpers.ts`):
 * defaults, conversión `answers` Map/objeto y shape exacto de `toPersistence`.
 */
import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import type { GameDoc } from "../../../types/db.js";
import { DEFAULT_TIME_LIMIT_MS } from "../../../constants/game.js";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { PlayerBuilder } from "../../../tests/builders/player-builder.js";
import { answersToRecord, toDomain, toPersistence, toPersistencePlayer } from "./game.mapper.js";

const QUESTION_ID = new Types.ObjectId("64b000000000000000000001");
const CREATED_AT = new Date("2026-01-02T03:04:05.000Z");

function makeDoc(overrides: Partial<GameDoc> = {}): GameDoc {
  return {
    _id: new Types.ObjectId("64b0000000000000000000aa"),
    name: "Partida de prueba",
    gameCode: "123456",
    status: "waiting",
    questions: [
      {
        _id: QUESTION_ID,
        text: "¿Capital de Francia?",
        options: ["Madrid", "París", "Roma", "Berlín"],
        correctAnswer: 1,
        image: null,
      },
    ],
    players: [
      {
        id: "player-1",
        name: "Ana",
        gameId: "123456",
        answers: { [QUESTION_ID.toString()]: 1 },
        score: 2001,
        joinedAt: CREATED_AT,
        avatar: { seed: "ana", accessories: ["hat"] },
      },
    ],
    createdAt: CREATED_AT,
    creatorId: "creator-1",
    currentQuestionIndex: 0,
    currentQuestionStartTime: 0,
    questionTimeLimit: 20000,
    locked: false,
    ...overrides,
  };
}

describe("answersToRecord", () => {
  it("convierte un Map (driver Mongo) a un objeto plano", () => {
    const answers = new Map<string, number>([
      ["q-1", 2],
      ["q-2", 0],
    ]);

    expect(answersToRecord(answers)).toEqual({ "q-1": 2, "q-2": 0 });
  });

  it("copia un objeto plano sin compartir la referencia original", () => {
    const answers: Record<string, number> = { "q-1": 3 };

    const result = answersToRecord(answers);

    expect(result).toEqual({ "q-1": 3 });
    expect(result).not.toBe(answers);
  });

  it("devuelve {} para undefined y null", () => {
    expect(answersToRecord(undefined)).toEqual({});
    expect(answersToRecord(null)).toEqual({});
  });

  it("devuelve {} para valores que no son colecciones", () => {
    expect(answersToRecord(42)).toEqual({});
    expect(answersToRecord("respuestas")).toEqual({});
    expect(answersToRecord(true)).toEqual({});
  });
});

describe("toDomain", () => {
  it("mapea el doc completo al dominio (paridad buildGame)", () => {
    const doc = makeDoc();

    const game = toDomain(doc);

    expect(game.id).toBe(doc.gameCode);
    expect(game.name).toBe("Partida de prueba");
    expect(game.status).toBe("waiting");
    expect(game.createdAt).toBe(CREATED_AT);
    expect(game.creatorId).toBe("creator-1");
    expect(game.currentQuestionIndex).toBe(0);
    expect(game.currentQuestionStartTime).toBe(0);
    expect(game.questionTimeLimit).toBe(20000);
    expect(game.locked).toBe(false);

    expect(game.questions).toHaveLength(1);
    expect(game.questions[0]).toEqual({
      id: QUESTION_ID.toString(),
      text: "¿Capital de Francia?",
      options: ["Madrid", "París", "Roma", "Berlín"],
      correctAnswer: 1,
      image: null,
    });

    expect(game.players).toHaveLength(1);
    expect(game.players[0]).toEqual({
      id: "player-1",
      name: "Ana",
      gameId: "123456", // el legacy usa el gameCode del doc, no el gameId del jugador
      answers: { [QUESTION_ID.toString()]: 1 },
      score: 2001,
      joinedAt: CREATED_AT,
      avatar: { seed: "ana", accessories: ["hat"] },
    });
  });

  it("aplica defaults: _id ausente ⇒ id '', image null, avatar undefined, startTime 0, límite default y locked false", () => {
    const doc = makeDoc({
      questions: [
        {
          text: "Sin id",
          options: ["A", "B", "C", "D"],
          correctAnswer: 0,
        },
      ],
      players: [
        {
          id: "player-2",
          name: "Luis",
          gameId: "123456",
          answers: {},
          score: 0,
          joinedAt: CREATED_AT,
        },
      ],
      currentQuestionStartTime: undefined,
      questionTimeLimit: undefined,
      locked: undefined,
    });

    const game = toDomain(doc);

    expect(game.questions[0].id).toBe("");
    expect(game.questions[0].image).toBeNull();
    expect(game.players[0].avatar).toBeUndefined();
    expect(game.currentQuestionStartTime).toBe(0);
    expect(game.questionTimeLimit).toBe(DEFAULT_TIME_LIMIT_MS);
    expect(game.locked).toBe(false);
  });

  it("acepta answers como Map (documento hidratado por el driver)", () => {
    const answersMap = new Map<string, number>([["q-1", 2]]);
    const doc = makeDoc({
      players: [
        {
          id: "player-1",
          name: "Ana",
          gameId: "123456",
          answers: answersMap as unknown as Record<string, number>,
          score: 2001,
          joinedAt: CREATED_AT,
        },
      ],
    });

    const game = toDomain(doc);

    expect(game.players[0].answers).toEqual({ "q-1": 2 });
    expect(game.players[0].answers).not.toBeInstanceOf(Map);
  });

  it("conserva el status cancelled", () => {
    expect(toDomain(makeDoc({ status: "cancelled" })).status).toBe("cancelled");
  });

  it("questionTimeLimit 0 cae al default (paridad con el `||` legacy)", () => {
    expect(toDomain(makeDoc({ questionTimeLimit: 0 })).questionTimeLimit).toBe(
      DEFAULT_TIME_LIMIT_MS
    );
  });
});

describe("toPersistence", () => {
  const game = new GameBuilder()
    .withId("654321")
    .withStatus("active")
    .withCurrentQuestionIndex(2)
    .withCurrentQuestionStartTime(1_700_000_000_000)
    .withQuestionTimeLimit(30000)
    .withLocked(true)
    .withPlayers(
      new PlayerBuilder()
        .withId("p-1")
        .withGameId("654321")
        .withAnswers({ "q-1": 1 })
        .withScore(2001)
        .build()
    )
    .build();

  it("emite solo los campos de estado (sin questions, createdAt, creatorId ni players)", () => {
    const persistence = toPersistence(game);

    expect(Object.keys(persistence).sort()).toEqual([
      "currentQuestionIndex",
      "currentQuestionStartTime",
      "gameCode",
      "locked",
      "name",
      "questionTimeLimit",
      "status",
    ]);
    expect("questions" in persistence).toBe(false);
    expect("createdAt" in persistence).toBe(false);
    expect("creatorId" in persistence).toBe(false);
    // US-19: `save` es state-only; `players` va por addPlayer/removePlayer/updatePlayers.
    expect("players" in persistence).toBe(false);
  });

  it("gameCode sale del id y conserva el estado mutable", () => {
    const persistence = toPersistence(game);

    expect(persistence.gameCode).toBe("654321");
    expect(persistence.status).toBe("active");
    expect(persistence.currentQuestionIndex).toBe(2);
    expect(persistence.currentQuestionStartTime).toBe(1_700_000_000_000);
    expect(persistence.questionTimeLimit).toBe(30000);
    expect(persistence.locked).toBe(true);
  });

  it("locked undefined se persiste como false", () => {
    const unlocked = new GameBuilder().withId("111111").build();

    expect(unlocked.locked).toBeUndefined();
    expect(toPersistence(unlocked).locked).toBe(false);
  });
});

describe("toPersistencePlayer", () => {
  it("sella gameId con el id de la partida y conserva answers plano, score, avatar y joinedAt", () => {
    const joinedAt = new Date("2026-01-02T03:04:05.000Z");
    const player = new PlayerBuilder()
      .withId("p-1")
      .withName("Ana")
      .withGameId("otro-game") // ajeno a propósito: el mapper debe sellarlo con gameId.
      .withAnswers({ "q-1": 1 })
      .withScore(2001)
      .withJoinedAt(joinedAt)
      .withAvatar({ seed: "ana", accessories: ["hat"] })
      .build();

    const persisted = toPersistencePlayer(player, "654321");

    expect(persisted).toMatchObject({
      id: "p-1",
      name: "Ana",
      gameId: "654321",
      answers: { "q-1": 1 },
      score: 2001,
      joinedAt,
      avatar: { seed: "ana", accessories: ["hat"] },
    });
    expect(persisted.answers).not.toBeInstanceOf(Map);
    expect(typeof persisted.answers).toBe("object");
  });

  it("avatar es opcional y no comparte la referencia original", () => {
    const player = new PlayerBuilder()
      .withId("p-2")
      .withName("Luis")
      .withGameId("654321")
      .withAnswers({ "q-1": 0 })
      .build();

    const persisted = toPersistencePlayer(player, "654321");

    expect(persisted.avatar).toBeUndefined();
    expect(persisted.answers).toEqual({ "q-1": 0 });
    expect(persisted.answers).not.toBe(player.answers);
  });
});
