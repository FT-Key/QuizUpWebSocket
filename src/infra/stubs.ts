import type { RealtimeGateway } from "../core/application/ports/realtime-gateway.js";
import type { TimerService } from "../core/application/ports/timer-service.js";

/**
 * Stubs temporales (US-06): permiten construir el container con los casos de
 * uso sin adaptador real. El gateway real llega en US-07 y los timers en US-08.
 * Nadie los usa en runtime todavía (el server legacy sigue activo).
 */

export function createNoopRealtimeGateway(): RealtimeGateway {
  return {
    toGame() {},
    toAdmins() {},
    broadcast() {},
    toSocket() {},
    joinGameRoom() {},
    leaveGameRoom() {},
    joinAdminRoom() {},
  };
}

export function createNoopTimerService(): TimerService {
  return {
    scheduleQuestionTimeout() {},
    clear() {},
    clearAll() {},
  };
}
