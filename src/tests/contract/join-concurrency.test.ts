/**
 * US-19 — Regresión de concurrencia de `join-game` (persistencia diferencial).
 *
 * Reproduce la carrera read → escritura externa → escritura:
 * - Bloque fake (corre siempre): un spy sobre `findByIdFresh` inyecta la
 *   escritura externa de P2 (equivalente al `$push` del POST /api/games/join de
 *   Next, otro proceso) en el almacén después de la lectura y devuelve la copia
 *   stale. El alta de `join` (P3) debe convivir con P2 vía `addPlayer`
 *   diferencial; con el `save` de array completo, P2 se perdía.
 * - Bloque Mongo (`skipIf(!MONGODB_URI_TEST)`): misma carrera con `$push` real
 *   sobre `GameModel` dentro del `findByIdFresh` interceptado (prefijo `ws19-`).
 */
import { describe, expect, it, vi } from "vitest";
import type { Game } from "../../core/domain/game.js";
import type { Player } from "../../core/domain/player.js";
import { createWaitingGameExpiryPolicy } from "../../core/domain/expiry/waiting-game-expiry-policy.js";
import { createJoinGameUseCase } from "../../core/application/use-cases/join-game.js";
import { GameBuilder } from "../builders/game-builder.js";
import { PlayerBuilder } from "../builders/player-builder.js";
import { QuestionBuilder } from "../builders/question-builder.js";
import { createFixedClock } from "../fakes/fixed-clock.js";
import { createInMemoryGameRepository } from "../fakes/in-memory-game-repository.js";
import { createRecordingGateway } from "../fakes/recording-gateway.js";
import { createSequentialIds } from "../fakes/sequential-ids.js";

const GAME_ID = "123456";
const BASE_TIME = 1_700_000_000_000;
const EXPIRY_MS = 60 * 60 * 1000;

/** Partida `waiting` recién creada (no expirada) con P1 dentro. */
function waitingGameWithP1(gameId = GAME_ID): Game {
  return new GameBuilder()
    .withId(gameId)
    .withCreatedAt(new Date(BASE_TIME))
    .withQuestion(new QuestionBuilder().withId("q-1").build())
    .withPlayers(
      new PlayerBuilder().withId("p-1").withName("Ana").withGameId(gameId).build()
    )
    .build();
}

/** Jugador externo (lo que el REST de Next agrega con `$push` fuera del WS). */
function externalPlayer(gameId: string, id: string): Player {
  return new PlayerBuilder()
    .withId(id)
    .withName("Externo")
    .withGameId(gameId)
    .withJoinedAt(new Date(BASE_TIME))
    .build();
}

describe("JoinGame — carrera de persistencia (US-19)", () => {
  it("carrera: el join externo de Next entre findByIdFresh y el alta no se pierde", async () => {
    const repo = createInMemoryGameRepository();
    const gateway = createRecordingGateway();
    const useCase = createJoinGameUseCase({
      repo,
      gateway,
      clock: createFixedClock(BASE_TIME),
      ids: createSequentialIds("player"),
      policy: createWaitingGameExpiryPolicy(EXPIRY_MS),
    });
    repo.seed(waitingGameWithP1()); // P1 en el almacén

    const originalFresh = repo.findByIdFresh.bind(repo);
    const externalP2 = externalPlayer(GAME_ID, "p-2");
    vi.spyOn(repo, "findByIdFresh").mockImplementation(async (gameId) => {
      const stale = await originalFresh(gameId); // copia sin P2
      // Escritura externa equivalente al POST /api/games/join de Next (otro
      // proceso): entra al almacén después de la lectura y antes del alta.
      const stored = repo.getCached(gameId)!;
      stored.players.push(externalP2);
      repo.seed(stored);
      return stale; // el caso de uso sigue con la copia previa
    });

    await useCase.execute({ gameId: GAME_ID, playerName: "Carla", socketId: "s-1" });

    const stored = await repo.findById(GAME_ID);
    expect(stored!.players.map((p) => p.id)).toEqual(["p-1", "p-2", "player-1"]);
  });
});
