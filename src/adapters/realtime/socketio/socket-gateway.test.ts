import { describe, expect, it } from "vitest";
import type { Server } from "socket.io";
import type { ClientToServerEvents, Game, Player, ServerToClientEvents } from "../../../types/types.js";
import { createSocketGateway } from "./socket-gateway.js";

interface FakeEmission {
  kind: "room" | "broadcast";
  room?: string;
  event: string;
  payload: unknown;
}

interface FakeJoinLeave {
  socketId: string;
  room: string;
  action: "join" | "leave";
}

function makeGame(): Game {
  return {
    id: "game-1",
    name: "Partida de prueba",
    questions: [],
    createdAt: new Date(0),
    creatorId: "creator-1",
    status: "waiting",
    currentQuestionIndex: 0,
    players: [],
    currentQuestionStartTime: 0,
    questionTimeLimit: 30_000,
  };
}

function makePlayer(): Player {
  return {
    id: "player-1",
    name: "Ana",
    gameId: "game-1",
    answers: {},
    score: 0,
    joinedAt: new Date(0),
  };
}

/**
 * Doble de `Server` de Socket.IO: registra cada emisión (a room o broadcast) y
 * cada `join`/`leave`, y solo conoce los sockets que se le dan de alta.
 */
function createFakeIo() {
  const emissions: FakeEmission[] = [];
  const joinLeave: FakeJoinLeave[] = [];
  const connectedSockets = new Map<string, string>();

  const io = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emissions.push({ kind: "room", room, event, payload });
        },
      };
    },
    emit(event: string, payload: unknown) {
      emissions.push({ kind: "broadcast", event, payload });
    },
    sockets: {
      sockets: {
        get(socketId: string) {
          if (!connectedSockets.has(socketId)) return undefined;
          return {
            join(room: string) {
              joinLeave.push({ socketId, room, action: "join" });
            },
            leave(room: string) {
              joinLeave.push({ socketId, room, action: "leave" });
            },
          };
        },
      },
    },
  };

  return {
    io: io as unknown as Server<ClientToServerEvents, ServerToClientEvents>,
    emissions,
    joinLeave,
    addSocket(socketId: string) {
      connectedSockets.set(socketId, socketId);
    },
  };
}

describe("SocketGateway — salas del contrato", () => {
  it("toGame emite a la sala game-<id>", () => {
    const { io, emissions } = createFakeIo();
    const gateway = createSocketGateway(io);
    const payload = { game: makeGame() };

    gateway.toGame("123456", "game-updated", payload);

    expect(emissions).toEqual([
      { kind: "room", room: "game-123456", event: "game-updated", payload },
    ]);
  });

  it("toAdmins emite a la sala game-<id>-admins", () => {
    const { io, emissions } = createFakeIo();
    const gateway = createSocketGateway(io);
    const payload = { player: makePlayer(), game: makeGame() };

    gateway.toAdmins("123456", "player-joined", payload);

    expect(emissions).toEqual([
      { kind: "room", room: "game-123456-admins", event: "player-joined", payload },
    ]);
  });

  it("broadcast emite a todos los sockets (dashboard)", () => {
    const { io, emissions } = createFakeIo();
    const gateway = createSocketGateway(io);
    const payload = [makeGame()];

    gateway.broadcast("update-dashboard", payload);

    expect(emissions).toEqual([
      { kind: "broadcast", event: "update-dashboard", payload },
    ]);
  });

  it("toSocket emite al socket concreto usando su id como room", () => {
    const { io, emissions } = createFakeIo();
    const gateway = createSocketGateway(io);

    gateway.toSocket("socket-1", "join-error", { message: "Game not found" });

    expect(emissions).toEqual([
      {
        kind: "room",
        room: "socket-1",
        event: "join-error",
        payload: { message: "Game not found" },
      },
    ]);
  });

  it("joinGameRoom y joinAdminRoom meten al socket en su sala", () => {
    const { io, joinLeave, addSocket } = createFakeIo();
    const gateway = createSocketGateway(io);
    addSocket("socket-1");

    gateway.joinGameRoom("socket-1", "123456");
    gateway.joinAdminRoom("socket-1", "123456");

    expect(joinLeave).toEqual([
      { socketId: "socket-1", room: "game-123456", action: "join" },
      { socketId: "socket-1", room: "game-123456-admins", action: "join" },
    ]);
  });

  it("leaveGameRoom saca al socket de su sala", () => {
    const { io, joinLeave, addSocket } = createFakeIo();
    const gateway = createSocketGateway(io);
    addSocket("socket-1");

    gateway.leaveGameRoom("socket-1", "123456");

    expect(joinLeave).toEqual([
      { socketId: "socket-1", room: "game-123456", action: "leave" },
    ]);
  });

  it("un socket inexistente no lanza ni registra join/leave", () => {
    const { io, joinLeave } = createFakeIo();
    const gateway = createSocketGateway(io);

    expect(() => {
      gateway.joinGameRoom("fantasma", "123456");
      gateway.leaveGameRoom("fantasma", "123456");
      gateway.joinAdminRoom("fantasma", "123456");
    }).not.toThrow();

    expect(joinLeave).toEqual([]);
  });
});
