import { describe, expect, it } from "vitest";
import {
  closeGameSchema,
  finishGameSchema,
  finishQuestionSchema,
  gameIdSchema,
  joinAdminSchema,
  joinGameSchema,
  leaveGameSchema,
  lockGameSchema,
  nextQuestionSchema,
  noPayloadSchema,
  requestDashboardSchema,
  requestGameStateSchema,
  startGameSchema,
  submitAnswerSchema,
} from "./socket-payloads.js";

describe("socket-payloads — join-game", () => {
  it("acepta el payload mínimo y el completo (avatar con accesorios)", () => {
    expect(joinGameSchema.safeParse({ gameId: "123456" }).success).toBe(true);
    expect(
      joinGameSchema.safeParse({
        gameId: "123456",
        playerId: "p-1",
        playerName: "Ana",
        avatar: { seed: "ana", accessories: ["hat"] },
      }).success
    ).toBe(true);
  });

  it("acepta playerId null (primer join: localStorage devuelve null) como ausente", () => {
    expect(
      joinGameSchema.safeParse({
        gameId: "123456",
        playerId: null,
        playerName: "Ana",
        avatar: { seed: "ana", accessories: ["hat"] },
      }).success
    ).toBe(true);
  });

  it("rechaza payload sin gameId o con tipos incorrectos", () => {
    expect(joinGameSchema.safeParse({}).success).toBe(false);
    expect(joinGameSchema.safeParse({ gameId: 123456 }).success).toBe(false);
    expect(joinGameSchema.safeParse({ gameId: "123456", playerName: 7 }).success).toBe(false);
    expect(
      joinGameSchema.safeParse({ gameId: "123456", avatar: { accessories: [] } }).success
    ).toBe(false);
  });
});

describe("socket-payloads — join-admin", () => {
  it("acepta el gameId como string pelado (contrato §2.1)", () => {
    expect(joinAdminSchema.safeParse("123456").success).toBe(true);
  });

  it("rechaza un objeto u otros tipos", () => {
    expect(joinAdminSchema.safeParse({ gameId: "123456" }).success).toBe(false);
    expect(joinAdminSchema.safeParse(123456).success).toBe(false);
  });
});

describe("socket-payloads — eventos con solo gameId", () => {
  const schemas = [
    ["gameIdSchema", gameIdSchema],
    ["startGameSchema", startGameSchema],
    ["nextQuestionSchema", nextQuestionSchema],
    ["finishQuestionSchema", finishQuestionSchema],
    ["finishGameSchema", finishGameSchema],
    ["closeGameSchema", closeGameSchema],
    ["requestGameStateSchema", requestGameStateSchema],
  ] as const;

  it.each(schemas)("%s acepta { gameId: string }", (_name, schema) => {
    expect(schema.safeParse({ gameId: "123456" }).success).toBe(true);
  });

  it.each(schemas)("%s rechaza payloads inválidos", (_name, schema) => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ gameId: 123456 }).success).toBe(false);
    expect(schema.safeParse("123456").success).toBe(false);
  });
});

describe("socket-payloads — submit-answer", () => {
  it("acepta el payload completo con answer numérico", () => {
    const payload = { gameId: "123456", playerId: "p-1", questionId: "q-1", answer: 0 };
    expect(submitAnswerSchema.safeParse(payload).success).toBe(true);
  });

  it("rechaza campos faltantes, answer no numérico o NaN", () => {
    expect(
      submitAnswerSchema.safeParse({ gameId: "123456", playerId: "p-1", questionId: "q-1" }).success
    ).toBe(false);
    expect(
      submitAnswerSchema.safeParse({ gameId: "123456", playerId: "p-1", questionId: "q-1", answer: "0" })
        .success
    ).toBe(false);
    expect(
      submitAnswerSchema.safeParse({ gameId: "123456", playerId: "p-1", questionId: "q-1", answer: NaN })
        .success
    ).toBe(false);
  });
});

describe("socket-payloads — leave-game", () => {
  it("acepta gameId + playerId y rechaza incompletos", () => {
    expect(leaveGameSchema.safeParse({ gameId: "123456", playerId: "p-1" }).success).toBe(true);
    expect(leaveGameSchema.safeParse({ gameId: "123456" }).success).toBe(false);
    expect(leaveGameSchema.safeParse({ playerId: "p-1" }).success).toBe(false);
  });
});

describe("socket-payloads — lock-game", () => {
  it("acepta locked booleano y rechaza otros tipos", () => {
    expect(lockGameSchema.safeParse({ gameId: "123456", locked: true }).success).toBe(true);
    expect(lockGameSchema.safeParse({ gameId: "123456", locked: false }).success).toBe(true);
    expect(lockGameSchema.safeParse({ gameId: "123456", locked: "true" }).success).toBe(false);
    expect(lockGameSchema.safeParse({ gameId: "123456" }).success).toBe(false);
  });
});

describe("socket-payloads — request-dashboard", () => {
  it("acepta undefined y null (Socket.IO serializa undefined como null) y rechaza otros valores", () => {
    expect(noPayloadSchema.safeParse(undefined).success).toBe(true);
    expect(noPayloadSchema.safeParse(null).success).toBe(true);
    expect(requestDashboardSchema.safeParse(undefined).success).toBe(true);
    expect(requestDashboardSchema.safeParse(null).success).toBe(true);
    expect(noPayloadSchema.safeParse({}).success).toBe(false);
  });
});
