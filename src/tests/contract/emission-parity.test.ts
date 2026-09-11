import { describe, expect, it } from "vitest";
import type { Server, Socket } from "socket.io";
import { registerSocketRouter } from "../../adapters/realtime/socketio/event-router.js";
import { createSocketGateway } from "../../adapters/realtime/socketio/socket-gateway.js";
import type { AppConfig } from "../../infra/config.js";
import { createContainer } from "../../infra/container.js";
import type { Game } from "../../core/domain/game.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../types/types.js";
import { GameBuilder } from "../builders/game-builder.js";
import { QuestionBuilder } from "../builders/question-builder.js";
import {
  createInMemoryGameRepository,
  type InMemoryGameRepository,
} from "../fakes/in-memory-game-repository.js";

/**
 * Paridad de emisiones de US-07 (§5.8): el flujo real de eventos
 * (`socket.on` → router → CommandBus → caso de uso → `RealtimeGateway` real)
 * sobre un `Server` de Socket.IO falso. Sin Mongo ni red: el container usa el
 * `GameRepository` en memoria y el gateway real (`createSocketGateway`).
 *
 * Se asertan las 5 secuencias clave del legacy como `(sala, evento)`; los
 * sockets se normalizan a `<socket>` en la secuencia.
 */

const GAME_ID = "123456";
const QUESTION_ID = "q-1";
const CORRECT_ANSWER = 1;

const config: AppConfig = {
  port: 0,
  mongoUri: "mongodb://localhost:27017/quizup",
  gameExpiryMinutes: 60,
  corsOrigin: "*",
  logLevel: "error",
};

type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface IoEmission {
  /** Sala destino; `*` = broadcast global (`io.emit`). */
  readonly room: string;
  readonly event: string;
  readonly payload: unknown;
}

interface RoomAction {
  readonly socketId: string;
  readonly room: string;
  readonly action: "join" | "leave";
}

interface FakeSocket {
  readonly id: string;
  readonly handlers: Map<string, (raw: unknown) => void>;
  on(event: string, listener: (raw: unknown) => void): FakeSocket;
  join(room: string): void;
  leave(room: string): void;
}

/**
 * Doble tipado de `Server` de Socket.IO: registra cada emisión `(sala, evento)`
 * en orden, cada `join`/`leave` y expone los sockets conectados para el gateway.
 */
function createFakeIo() {
  const emissions: IoEmission[] = [];
  const roomActions: RoomAction[] = [];
  const sockets = new Map<string, FakeSocket>();
  const connectionHandlers: Array<(socket: ClientSocket) => void> = [];

  const io = {
    on(event: string, handler: (socket: ClientSocket) => void) {
      if (event === "connection") connectionHandlers.push(handler);
      return io;
    },
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emissions.push({ room, event, payload });
        },
      };
    },
    emit(event: string, payload: unknown) {
      emissions.push({ room: "*", event, payload });
    },
    sockets: {
      sockets: {
        get(socketId: string) {
          return sockets.get(socketId);
        },
      },
    },
  };

  return {
    io: io as unknown as Server<ClientToServerEvents, ServerToClientEvents>,
    emissions,
    roomActions,
    addSocket(socketId: string): FakeSocket {
      const socket: FakeSocket = {
        id: socketId,
        handlers: new Map(),
        on(event, listener) {
          socket.handlers.set(event, listener);
          return socket;
        },
        join(room) {
          roomActions.push({ socketId, room, action: "join" });
        },
        leave(room) {
          roomActions.push({ socketId, room, action: "leave" });
        },
      };
      sockets.set(socketId, socket);
      for (const handler of connectionHandlers) {
        handler(socket as unknown as ClientSocket);
      }
      return socket;
    },
  };
}

/** Container real con repo en memoria y gateway Socket.IO real sobre el io falso. */
function setup() {
  const repo = createInMemoryGameRepository();
  const fake = createFakeIo();
  const container = createContainer(config, {
    repo,
    gateway: createSocketGateway(fake.io),
  });
  registerSocketRouter(fake.io, container.bus, container.logger);

  return { repo, container, ...fake };
}

type Setup = ReturnType<typeof setup>;

/** Deja drenar la cadena `dispatch` (fire-and-forget del router). */
const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/** `(sala, evento)` con los sockets normalizados a `<socket>`. */
function sequence(emissions: readonly IoEmission[]): string[] {
  return emissions.map(({ room, event }) => {
    const label = room === "*" || room.startsWith("game-") ? room : "<socket>";
    return `${label}:${event}`;
  });
}

function payloadOf(
  emissions: readonly IoEmission[],
  room: string,
  event: string
): unknown {
  return emissions.find((e) => e.room === room && e.event === event)?.payload;
}

/** Siembra una partida `waiting` recién creada (no expirada para la policy). */
function seedGame(repo: InMemoryGameRepository): void {
  repo.seed(
    new GameBuilder()
      .withId(GAME_ID)
      .withCreatedAt(new Date())
      .withQuestion(
        new QuestionBuilder().withId(QUESTION_ID).withCorrectAnswer(CORRECT_ANSWER).build()
      )
      .build()
  );
}

/** Dispara `join-game` por el router y devuelve el socket y el playerId creado. */
async function joinPlayer(
  ctx: Setup,
  socketId: string,
  playerName: string
): Promise<{ socket: FakeSocket; playerId: string }> {
  const socket = ctx.addSocket(socketId);
  socket.handlers.get("join-game")?.({
    gameId: GAME_ID,
    playerId: null,
    playerName,
  });
  await flush();

  const game = await ctx.repo.findById(GAME_ID);
  const player = game?.players.find((p) => p.name === playerName);
  if (!player) throw new Error(`join-game no agregó a ${playerName}`);
  return { socket, playerId: player.id };
}

/**
 * El fake en memoria devuelve copias defensivas en cada lectura, pero los casos
 * de uso que mutan sin `save` (`submit-answer`, `force-finish-question`) confían
 * en la caché viva del adaptador Mongo (que devuelve la referencia cacheada).
 * Este helper re-siembra el estado mutado ya emitido para emular ese aliasing,
 * igual que hace `submit-answer.test.ts` entre dos submits.
 */
function syncLiveCache(ctx: Setup, room: string): void {
  const payload = payloadOf(ctx.emissions, room, "game-updated");
  const game = (payload as { game: Game } | undefined)?.game;
  if (!game) throw new Error("sin game-updated para sincronizar la caché viva");
  ctx.repo.seed(game);
}

describe("EmissionParity — flujo real por event-router + gateway Socket.IO", () => {
  it("join-game: game-state→admins, joined→socket, player-joined→admins, game-updated→sala+admins y dashboard", async () => {
    const ctx = setup();
    seedGame(ctx.repo);
    const socket = ctx.addSocket("socket-p1");

    socket.handlers.get("join-game")?.({
      gameId: GAME_ID,
      playerId: null,
      playerName: "Ana",
      avatar: { seed: "ana" },
    });
    await flush();

    expect(sequence(ctx.emissions)).toEqual([
      "game-123456-admins:game-state",
      "<socket>:joined",
      "game-123456-admins:player-joined",
      "game-123456:game-updated",
      "game-123456-admins:game-updated",
      "*:update-dashboard",
    ]);
    expect(ctx.roomActions).toEqual([
      { socketId: "socket-p1", room: "game-123456", action: "join" },
    ]);
    expect(payloadOf(ctx.emissions, "socket-p1", "joined")).toMatchObject({
      player: { name: "Ana", gameId: GAME_ID },
      game: { id: GAME_ID },
    });
  });

  it("start-game: game-started→sala+admins y dashboard", async () => {
    const ctx = setup();
    seedGame(ctx.repo);
    const { socket } = await joinPlayer(ctx, "socket-p1", "Ana");
    ctx.emissions.length = 0;

    socket.handlers.get("start-game")?.({ gameId: GAME_ID });
    await flush();

    expect(sequence(ctx.emissions)).toEqual([
      "game-123456:game-started",
      "game-123456-admins:game-started",
      "*:update-dashboard",
    ]);
    expect(payloadOf(ctx.emissions, "game-123456", "game-started")).toMatchObject({
      game: { id: GAME_ID, status: "active" },
      currentQuestion: { id: QUESTION_ID },
    });
  });

  it("submit-answer: el último jugador emite answer-submitted, game-updated y question-finished", async () => {
    const ctx = setup();
    seedGame(ctx.repo);
    const { socket: socketA, playerId: playerA } = await joinPlayer(ctx, "socket-a", "Ana");
    const { socket: socketB, playerId: playerB } = await joinPlayer(ctx, "socket-b", "Luis");
    socketA.handlers.get("start-game")?.({ gameId: GAME_ID });
    await flush();
    ctx.emissions.length = 0;

    socketA.handlers.get("submit-answer")?.({
      gameId: GAME_ID,
      playerId: playerA,
      questionId: QUESTION_ID,
      answer: 0,
    });
    await flush();

    expect(sequence(ctx.emissions)).toEqual([
      "<socket>:answer-submitted",
      "game-123456:game-updated",
      "game-123456-admins:game-updated",
    ]);
    syncLiveCache(ctx, "game-123456");

    ctx.emissions.length = 0;
    socketB.handlers.get("submit-answer")?.({
      gameId: GAME_ID,
      playerId: playerB,
      questionId: QUESTION_ID,
      answer: CORRECT_ANSWER,
    });
    await flush();

    expect(sequence(ctx.emissions)).toEqual([
      "<socket>:answer-submitted",
      "game-123456:game-updated",
      "game-123456-admins:game-updated",
      "game-123456:question-finished",
      "game-123456-admins:question-finished",
    ]);
    const update = payloadOf(ctx.emissions, "game-123456", "game-updated") as {
      game: Game;
    };
    expect(update.game.players.find((p) => p.id === playerA)?.answers).toEqual({
      [QUESTION_ID]: 0,
    });
    expect(update.game.players.find((p) => p.id === playerB)?.answers).toEqual({
      [QUESTION_ID]: CORRECT_ANSWER,
    });
  });

  it("finish-question: fuerza el cierre con la pregunta abierta (question-finished + game-updated, sin dashboard)", async () => {
    const ctx = setup();
    seedGame(ctx.repo);
    const { socket } = await joinPlayer(ctx, "socket-a", "Ana");
    await joinPlayer(ctx, "socket-b", "Luis");
    socket.handlers.get("start-game")?.({ gameId: GAME_ID });
    await flush();
    ctx.emissions.length = 0;

    socket.handlers.get("finish-question")?.({ gameId: GAME_ID });
    await flush();

    expect(sequence(ctx.emissions)).toEqual([
      "game-123456:question-finished",
      "game-123456-admins:question-finished",
      "game-123456:game-updated",
      "game-123456-admins:game-updated",
    ]);
    expect(ctx.emissions.some((e) => e.event === "update-dashboard")).toBe(false);
    expect(payloadOf(ctx.emissions, "game-123456", "game-updated")).toMatchObject({
      game: { status: "active", currentQuestionStartTime: 0 },
    });
  });

  it("finish-game: game-finished con results→sala+admins y dashboard", async () => {
    const ctx = setup();
    seedGame(ctx.repo);
    const { socket } = await joinPlayer(ctx, "socket-a", "Ana");
    socket.handlers.get("start-game")?.({ gameId: GAME_ID });
    await flush();
    ctx.emissions.length = 0;

    socket.handlers.get("finish-game")?.({ gameId: GAME_ID });
    await flush();

    expect(sequence(ctx.emissions)).toEqual([
      "game-123456:game-finished",
      "game-123456-admins:game-finished",
      "*:update-dashboard",
    ]);
    expect(payloadOf(ctx.emissions, "game-123456", "game-finished")).toMatchObject({
      game: { id: GAME_ID, status: "finished" },
      results: { gameId: GAME_ID, totalPlayers: 1, totalQuestions: 1 },
    });
  });

  it("flujo completo por el router: join→start→submit(allAnswered)→finish-question→finish-game", async () => {
    const ctx = setup();
    seedGame(ctx.repo);
    const { socket, playerId } = await joinPlayer(ctx, "socket-p1", "Ana");
    ctx.emissions.length = 0;

    socket.handlers.get("start-game")?.({ gameId: GAME_ID });
    await flush();
    expect(sequence(ctx.emissions)).toEqual([
      "game-123456:game-started",
      "game-123456-admins:game-started",
      "*:update-dashboard",
    ]);

    ctx.emissions.length = 0;
    socket.handlers.get("submit-answer")?.({
      gameId: GAME_ID,
      playerId,
      questionId: QUESTION_ID,
      answer: CORRECT_ANSWER,
    });
    await flush();
    expect(sequence(ctx.emissions)).toEqual([
      "<socket>:answer-submitted",
      "game-123456:game-updated",
      "game-123456-admins:game-updated",
      "game-123456:question-finished",
      "game-123456-admins:question-finished",
    ]);

    // `submit(allAnswered)` ya cerró la pregunta (`currentQuestionStartTime = 0`),
    // así que el guard de `ForceFinishQuestion` hace que `finish-question` no
    // vuelva a emitir (paridad con el timeout legacy). El caso con la pregunta
    // abierta se cubre en el test dedicado de arriba.
    syncLiveCache(ctx, "game-123456");
    ctx.emissions.length = 0;
    socket.handlers.get("finish-question")?.({ gameId: GAME_ID });
    await flush();
    expect(ctx.emissions).toEqual([]);

    socket.handlers.get("finish-game")?.({ gameId: GAME_ID });
    await flush();
    expect(sequence(ctx.emissions)).toEqual([
      "game-123456:game-finished",
      "game-123456-admins:game-finished",
      "*:update-dashboard",
    ]);
  });
});
