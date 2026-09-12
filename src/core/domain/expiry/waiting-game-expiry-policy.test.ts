/**
 * Tests de `createWaitingGameExpiryPolicy` (US-04).
 *
 * Paridad con `isWaitingGameExpired` (cleanupStaleGames.ts:15-22): comparación
 * estricta `>`, `createdAt` inválida ⇒ false y guard de status dentro de la
 * política. Sin IO ni reloj global: `now` entra por parámetro.
 */
import { describe, expect, it } from "vitest";
import type { GameCleanupPolicy } from "../../application/ports/game-cleanup-policy.js";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { createWaitingGameExpiryPolicy } from "./waiting-game-expiry-policy.js";

const BASE_TIME = 1_700_000_000_000;
const EXPIRY_MS = 60 * 60 * 1000;

const waitingGameCreatedAt = (createdAt: Date) =>
  new GameBuilder().withStatus("waiting").withCreatedAt(createdAt).build();

describe("waiting-game-expiry-policy — paridad isWaitingGameExpired", () => {
  it("waiting con antigüedad > expiryMs ⇒ true", () => {
    const policy = createWaitingGameExpiryPolicy(EXPIRY_MS);
    const game = waitingGameCreatedAt(new Date(BASE_TIME));

    expect(policy.isExpired(game, BASE_TIME + EXPIRY_MS + 1)).toBe(true);
  });

  it("waiting exactamente en el límite (== expiryMs) ⇒ false (comparación estricta)", () => {
    const policy = createWaitingGameExpiryPolicy(EXPIRY_MS);
    const game = waitingGameCreatedAt(new Date(BASE_TIME));

    expect(policy.isExpired(game, BASE_TIME + EXPIRY_MS)).toBe(false);
  });

  it("active antigua ⇒ false; waiting reciente ⇒ false", () => {
    const policy = createWaitingGameExpiryPolicy(EXPIRY_MS);

    const active = new GameBuilder()
      .withStatus("active")
      .withCreatedAt(new Date(BASE_TIME))
      .build();
    expect(policy.isExpired(active, BASE_TIME + EXPIRY_MS + 1)).toBe(false);

    const recent = waitingGameCreatedAt(new Date(BASE_TIME));
    expect(policy.isExpired(recent, BASE_TIME + EXPIRY_MS - 1)).toBe(false);
  });

  it("createdAt inválida (new Date(NaN)) ⇒ false", () => {
    const policy = createWaitingGameExpiryPolicy(EXPIRY_MS);
    const game = waitingGameCreatedAt(new Date(NaN));

    expect(policy.isExpired(game, BASE_TIME)).toBe(false);
  });

  it("es asignable a GameCleanupPolicy (compile-time, sin any)", () => {
    const policy: GameCleanupPolicy = createWaitingGameExpiryPolicy(EXPIRY_MS);
    const game = waitingGameCreatedAt(new Date(BASE_TIME));

    expect(policy.isExpired(game, BASE_TIME + EXPIRY_MS + 1)).toBe(true);
  });
});
