import { describe, expect, it, vi } from "vitest";
import type { Server, Socket } from "socket.io";
import type { CommandBus } from "../../../core/application/commands/command-bus.js";
import type { UseCases } from "../../../core/application/commands/commands.js";
import type { Logger } from "../../../core/application/ports/logger.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../../types/types.js";
import { registerSocketRouter } from "./event-router.js";

const CONTRACT_EVENTS = [
  "join-game",
  "join-admin",
  "start-game",
  "next-question",
  "finish-question",
  "finish-game",
  "submit-answer",
  "leave-game",
  "lock-game",
  "close-game",
  "request-dashboard",
  "request-game-state",
] as const;

type ConnectionHandler = (
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
) => void;

interface FakeSocket {
  readonly id: string;
  readonly handlers: Map<string, (raw: unknown) => void>;
  on(event: string, listener: (raw: unknown) => void): void;
}

function createFakeSocket(id: string): FakeSocket {
  const handlers = new Map<string, (raw: unknown) => void>();
  return {
    id,
    handlers,
    on(event, listener) {
      handlers.set(event, listener);
    },
  };
}

/** Doble de `Server`: captura el handler de `connection` para dispararlo a mano. */
function createFakeIo() {
  const connectionHandlers: ConnectionHandler[] = [];
  const io = {
    on(event: string, handler: ConnectionHandler) {
      if (event === "connection") connectionHandlers.push(handler);
      return io;
    },
  };

  return {
    io: io as unknown as Server<ClientToServerEvents, ServerToClientEvents>,
    connect(socket: FakeSocket) {
      for (const handler of connectionHandlers) {
        handler(socket as unknown as Socket<ClientToServerEvents, ServerToClientEvents>);
      }
    },
  };
}

function createFakeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

type DispatchFn = (type: string, raw: unknown, context: { socketId: string }) => Promise<void>;

function setup(socketId = "s-1") {
  const { io, connect } = createFakeIo();
  const dispatch = vi.fn<DispatchFn>().mockResolvedValue(undefined);
  const bus: CommandBus<UseCases> = { dispatch };
  const logger = createFakeLogger();
  const socket = createFakeSocket(socketId);

  registerSocketRouter(io, bus, logger);
  connect(socket);

  return { socket, dispatch, logger };
}

describe("SocketEventRouter", () => {
  it("registra los 12 eventos del contrato y despacha cada uno con el socketId", () => {
    const { socket, dispatch } = setup("s-7");

    expect([...socket.handlers.keys()]).toEqual([...CONTRACT_EVENTS]);

    CONTRACT_EVENTS.forEach((event, index) => {
      const raw = { event };
      socket.handlers.get(event)?.(raw);

      expect(dispatch).toHaveBeenNthCalledWith(index + 1, event, raw, {
        socketId: "s-7",
      });
    });
  });

  it("despacha el payload crudo con el contexto { socketId }", () => {
    const { socket, dispatch } = setup("s-1");
    const payload = { gameId: "123456" };

    socket.handlers.get("start-game")?.(payload);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("start-game", payload, {
      socketId: "s-1",
    });
  });

  it("si el bus falla, loguea el error y el socket sigue operativo", async () => {
    const { socket, dispatch, logger } = setup("s-2");
    dispatch.mockRejectedValueOnce(new Error("boom"));

    socket.handlers.get("submit-answer")?.({ gameId: "123456" });
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
    expect(logger.error).toHaveBeenCalledWith(
      "[router] submit-answer failed",
      expect.any(Error)
    );

    // El fallo no propaga: el socket puede seguir despachando eventos.
    socket.handlers.get("lock-game")?.({ gameId: "123456", locked: true });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith(
      "lock-game",
      { gameId: "123456", locked: true },
      { socketId: "s-2" }
    );
  });

  it("join-admin despacha el gameId pelado del contrato", () => {
    const { socket, dispatch } = setup("s-3");

    socket.handlers.get("join-admin")?.("123456");

    expect(dispatch).toHaveBeenCalledWith("join-admin", "123456", {
      socketId: "s-3",
    });
  });
});
