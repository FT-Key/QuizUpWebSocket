import { describe, expect, it, vi } from "vitest";
import type { Game } from "../../domain/game.js";
import { ConflictError, NotFoundError } from "../../domain/errors.js";
import { createWaitingGameExpiryPolicy } from "../../domain/expiry/waiting-game-expiry-policy.js";
import { GameBuilder } from "../../../tests/builders/game-builder.js";
import { PlayerBuilder } from "../../../tests/builders/player-builder.js";
import { QuestionBuilder } from "../../../tests/builders/question-builder.js";
import { createFixedClock } from "../../../tests/fakes/fixed-clock.js";
import { createInMemoryGameRepository } from "../../../tests/fakes/in-memory-game-repository.js";
import {
  createRecordingGateway,
  type RecordedEmission,
  type RecordingGateway,
} from "../../../tests/fakes/recording-gateway.js";
import { createSequentialIds } from "../../../tests/fakes/sequential-ids.js";
import { createJoinGameUseCase } from "./join-game.js";

const GAME_ID = "123456";
const BASE_TIME = 1_700_000_000_000;
const EXPIRY_MS = 60 * 60 * 1000;
const QUESTION = new QuestionBuilder().withId("q-1").withCorrectAnswer(1).build();

function setup() {
  const repo = createInMemoryGameRepository();
  const gateway = createRecordingGateway();
  const clock = createFixedClock(BASE_TIME);
  const policy = createWaitingGameExpiryPolicy(EXPIRY_MS);
  const useCase = createJoinGameUseCase({
    repo,
    clock,
    ids: createSequentialIds("player"),
    gateway,
    policy,
  });
  return { repo, gateway, clock, policy, useCase };
}

function waitingGame() {
  return new GameBuilder()
    .withId(GAME_ID)
    .withCreatedAt(new Date(BASE_TIME))
    .withQuestions(QUESTION)
    .build();
}

function emissionOf(
  gateway: RecordingGateway,
  kind: RecordedEmission["kind"],
  event?: string
): RecordedEmission {
  const found = gateway.emissions.find((e) => e.kind === kind && e.event === event);
  if (!found) throw new Error(`No se emitió ${kind}:${event ?? "(sin evento)"}`);
  return found;
}

describe("JoinGame — alta de jugador nuevo", () => {
  it("persiste al jugador, responde al socket y emite en el orden legacy", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(waitingGame());
    const addPlayerSpy = vi.spyOn(repo, "addPlayer");

    const result = await useCase.execute({
      gameId: GAME_ID,
      playerName: "Ana",
      socketId: "s-1",
    });

    expect(result.player).toMatchObject({
      id: "player-1",
      name: "Ana",
      gameId: GAME_ID,
      answers: {},
      answerTimesMs: {},
      score: 0,
      avatar: { seed: "Ana" },
    });
    // US-20: el alta nueva nace con el mapa de tiempos (clave presente aunque vacía).
    expect("answerTimesMs" in result.player).toBe(true);
    expect(result.player.joinedAt.getTime()).toBe(BASE_TIME);
    expect(result.game.players).toHaveLength(1);

    expect(gateway.emissions.map((e) => (e.event ? `${e.kind}:${e.event}` : e.kind))).toEqual([
      "joinGameRoom",
      "admins:game-state",
      "socket:joined",
      "admins:player-joined",
      "game:game-updated",
      "admins:game-updated",
      "broadcast:update-dashboard",
    ]);

    const state = emissionOf(gateway, "admins", "game-state");
    expect(state.gameId).toBe(GAME_ID);
    expect((state.payload as { currentQuestion: { id: string } }).currentQuestion.id).toBe("q-1");
    expect((state.payload as { timeLeft: number }).timeLeft).toBe(20000);
    expect((state.payload as { game: Game }).game.players).toHaveLength(1);

    const joined = emissionOf(gateway, "socket", "joined");
    expect(joined.socketId).toBe("s-1");
    expect((joined.payload as { player: { name: string } }).player.name).toBe("Ana");

    const dashboard = emissionOf(gateway, "broadcast", "update-dashboard");
    expect((dashboard.payload as Game[]).map((g) => g.id)).toEqual([GAME_ID]);

    const saved = await repo.findById(GAME_ID);
    expect(saved!.players).toHaveLength(1);
    expect(saved!.players[0].name).toBe("Ana");
    expect(saved!.players[0].avatar).toEqual({ seed: "Ana" });

    // US-19: el alta se persiste con `addPlayer` diferencial (no con `save`).
    expect(addPlayerSpy).toHaveBeenCalledTimes(1);
    expect(addPlayerSpy).toHaveBeenCalledWith(
      GAME_ID,
      expect.objectContaining({ id: "player-1", name: "Ana", gameId: GAME_ID })
    );
  });

  it("trata playerId null como alta nueva (el cliente lo emite en el primer join, sin join-error)", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(waitingGame());

    const result = await useCase.execute({
      gameId: GAME_ID,
      playerId: null,
      playerName: "Ana",
      socketId: "s-1",
    });

    expect(result.player).toMatchObject({ id: "player-1", name: "Ana", gameId: GAME_ID });
    expect(gateway.emissions.some((e) => e.event === "join-error")).toBe(false);
  });

  it("acepta avatar explícito del cliente", async () => {
    const { repo, useCase } = setup();
    repo.seed(waitingGame());

    const result = await useCase.execute({
      gameId: GAME_ID,
      playerName: "Ana",
      avatar: { seed: "ana-custom", accessories: ["hat"] },
      socketId: "s-1",
    });

    expect(result.player.avatar).toEqual({ seed: "ana-custom", accessories: ["hat"] });
  });
});

describe("JoinGame — errores (mensajes exactos + join-error al socket)", () => {
  it("partida inexistente: NotFoundError('Game not found')", async () => {
    const { gateway, useCase } = setup();

    const error = await useCase
      .execute({ gameId: GAME_ID, playerName: "Ana", socketId: "s-1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as Error).message).toBe("Game not found");
    expect(gateway.emissions).toEqual([
      { kind: "socket", socketId: "s-1", event: "join-error", payload: { message: "Game not found" } },
    ]);
  });

  it("partida bloqueada: ConflictError('El ingreso está bloqueado') sin agregar jugador", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(new GameBuilder().withId(GAME_ID).withLocked(true).build());

    const error = await useCase
      .execute({ gameId: GAME_ID, playerName: "Ana", socketId: "s-1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe("El ingreso está bloqueado");
    expect(emissionOf(gateway, "socket", "join-error").payload).toEqual({
      message: "El ingreso está bloqueado",
    });
    expect((await repo.findById(GAME_ID))!.players).toHaveLength(0);
  });

  it("partida waiting expirada: cancela, persiste y responde 'La partida fue cerrada por inactividad'", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(
      new GameBuilder()
        .withId(GAME_ID)
        .withCreatedAt(new Date(BASE_TIME - EXPIRY_MS - 1))
        .build()
    );

    const error = await useCase
      .execute({ gameId: GAME_ID, playerName: "Ana", socketId: "s-1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe("La partida fue cerrada por inactividad");
    expect((await repo.findById(GAME_ID))!.status).toBe("cancelled");
    expect(emissionOf(gateway, "socket", "join-error").payload).toEqual({
      message: "La partida fue cerrada por inactividad",
    });
  });

  it("partida ya iniciada: ConflictError('La partida ya comenzó')", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(new GameBuilder().withId(GAME_ID).withStatus("active").build());

    const error = await useCase
      .execute({ gameId: GAME_ID, playerName: "Ana", socketId: "s-1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe("La partida ya comenzó");
    expect(emissionOf(gateway, "socket", "join-error").payload).toEqual({
      message: "La partida ya comenzó",
    });
  });

  it("sin playerId ni playerName: NotFoundError('Invalid join data')", async () => {
    const { repo, gateway, useCase } = setup();
    repo.seed(waitingGame());

    const error = await useCase.execute({ gameId: GAME_ID, socketId: "s-1" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as Error).message).toBe("Invalid join data");
    expect(emissionOf(gateway, "socket", "join-error").payload).toEqual({
      message: "Invalid join data",
    });
  });

  it("reconexión con playerId inexistente: NotFoundError('Invalid join data')", async () => {
    const { repo, gateway, useCase } = setup();
    const player = new PlayerBuilder().withId("p-1").withGameId(GAME_ID).build();
    repo.seed(new GameBuilder().withId(GAME_ID).withPlayer(player).build());

    const error = await useCase
      .execute({ gameId: GAME_ID, playerId: "p-otro", socketId: "s-1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as Error).message).toBe("Invalid join data");
    expect(emissionOf(gateway, "socket", "join-error").payload).toEqual({
      message: "Invalid join data",
    });
  });
});

describe("JoinGame — reconexión por playerId", () => {
  function activeGameWithPlayer() {
    const player = new PlayerBuilder()
      .withId("p-1")
      .withName("Ana")
      .withGameId(GAME_ID)
      .withAvatar({ seed: "ana-av", accessories: ["hat"] })
      .withAnswers({ "q-1": 1 })
      .withScore(1950)
      .withJoinedAt(new Date(BASE_TIME - 10_000))
      .build();

    return {
      player,
      game: new GameBuilder()
        .withId(GAME_ID)
        .withStatus("active")
        .withCurrentQuestionStartTime(BASE_TIME - 504)
        .withQuestions(QUESTION)
        .withPlayers(player)
        .build(),
    };
  }

  it("devuelve el jugador existente sin duplicarlo con timeLeft 19496 (20000 - 504, sin recorte)", async () => {
    const { repo, gateway, useCase } = setup();
    const { game } = activeGameWithPlayer();
    repo.seed(game);
    const updatePlayersSpy = vi.spyOn(repo, "updatePlayers");

    const result = await useCase.execute({ gameId: GAME_ID, playerId: "p-1", socketId: "s-2" });

    expect(result.player).toMatchObject({
      id: "p-1",
      name: "Ana",
      score: 1950,
      answers: { "q-1": 1 },
      avatar: { seed: "ana-av", accessories: ["hat"] },
    });
    expect((await repo.findById(GAME_ID))!.players).toHaveLength(1);
    expect(updatePlayersSpy).not.toHaveBeenCalled();
    expect((emissionOf(gateway, "admins", "game-state").payload as { timeLeft: number }).timeLeft).toBe(
      19496
    );
  });

  it("CARACTERIZACIÓN: pregunta vencida en join ⇒ timeLeft negativo (legacy no clampea a 0)", async () => {
    const { repo, gateway, useCase } = setup();
    const player = new PlayerBuilder().withId("p-1").withName("Ana").withGameId(GAME_ID).build();
    repo.seed(
      new GameBuilder()
        .withId(GAME_ID)
        .withStatus("active")
        .withCurrentQuestionStartTime(BASE_TIME - 25_000)
        .withQuestions(QUESTION)
        .withPlayers(player)
        .build()
    );

    await useCase.execute({ gameId: GAME_ID, playerId: "p-1", socketId: "s-2" });

    expect(
      (emissionOf(gateway, "admins", "game-state").payload as { timeLeft: number }).timeLeft
    ).toBe(-5000);
  });

  it("actualiza el avatar cuando el cliente manda uno distinto y lo persiste", async () => {
    const { repo, gateway, useCase } = setup();
    const { game } = activeGameWithPlayer();
    repo.seed(game);
    const updatePlayersSpy = vi.spyOn(repo, "updatePlayers");

    const result = await useCase.execute({
      gameId: GAME_ID,
      playerId: "p-1",
      avatar: { seed: "nueva", accessories: ["crown"] },
      socketId: "s-2",
    });

    expect(result.player.avatar).toEqual({ seed: "nueva", accessories: ["crown"] });
    expect(updatePlayersSpy).toHaveBeenCalledTimes(1);
    expect(updatePlayersSpy).toHaveBeenCalledWith(GAME_ID, [result.player]);
    expect((await repo.findById(GAME_ID))!.players[0].avatar).toEqual({
      seed: "nueva",
      accessories: ["crown"],
    });
    const joined = emissionOf(gateway, "socket", "joined");
    expect((joined.payload as { player: { avatar: unknown } }).player.avatar).toEqual({
      seed: "nueva",
      accessories: ["crown"],
    });
  });

  it("aplica fallback al avatar guardado cuando seed/accesorios vienen vacíos", async () => {
    const { repo, useCase } = setup();
    const { game } = activeGameWithPlayer();
    repo.seed(game);
    const updatePlayersSpy = vi.spyOn(repo, "updatePlayers");

    const result = await useCase.execute({
      gameId: GAME_ID,
      playerId: "p-1",
      avatar: { seed: "", accessories: [] },
      socketId: "s-2",
    });

    expect(result.player.avatar).toEqual({ seed: "ana-av", accessories: ["hat"] });
    expect(updatePlayersSpy).not.toHaveBeenCalled();
  });

  it("CARACTERIZACIÓN US-16: lee la partida fresca, no la copia cacheada stale (join cross-proceso)", async () => {
    const { repo, gateway, useCase } = setup();
    const { game } = activeGameWithPlayer();
    repo.seed(game);

    // Caché stale: el admin cargó la partida antes de que el REST de Next
    // agregara al jugador desde otro proceso. `findById` no lo ve; la lectura
    // fresca sí. Si el caso de uso regresa a `findById`, este test falla con
    // NotFoundError("Invalid join data").
    const stale = new GameBuilder()
      .withId(GAME_ID)
      .withStatus("active")
      .withQuestions(QUESTION)
      .build();
    const findByIdSpy = vi.spyOn(repo, "findById").mockResolvedValue(stale);
    const findByIdFreshSpy = vi.spyOn(repo, "findByIdFresh");

    const result = await useCase.execute({ gameId: GAME_ID, playerId: "p-1", socketId: "s-2" });

    expect(findByIdFreshSpy).toHaveBeenCalledWith(GAME_ID);
    expect(findByIdSpy).not.toHaveBeenCalled();
    expect(result.player.id).toBe("p-1");
    expect(gateway.emissions.some((e) => e.event === "join-error")).toBe(false);
    expect((emissionOf(gateway, "socket", "joined").payload as { player: { id: string } }).player.id).toBe(
      "p-1"
    );
    expect(
      (emissionOf(gateway, "admins", "player-joined").payload as { player: { id: string } }).player.id
    ).toBe("p-1");
  });
});
