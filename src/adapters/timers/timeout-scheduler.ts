import type { TimeoutHandler, TimerService } from "../../core/application/ports/timer-service.js";

/**
 * `TimerService` real (Adapter sobre `setTimeout`): mantiene un timer por
 * partida para el fin de pregunta automático. Programar de nuevo la misma
 * partida reemplaza el timeout anterior (paridad con el legacy
 * `startQuestionTimeout`). `unref()` evita retener el proceso (paridad con
 * `cleanupStaleGames`).
 */
export function createTimeoutScheduler(): TimerService {
  const timers = new Map<string, NodeJS.Timeout>();

  const cancel = (gameId: string): void => {
    const timer = timers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(gameId);
    }
  };

  return {
    scheduleQuestionTimeout(gameId: string, delayMs: number, onTimeout: TimeoutHandler): void {
      cancel(gameId);

      const timer = setTimeout(() => {
        timers.delete(gameId);
        void onTimeout();
      }, delayMs);
      timer.unref?.();

      timers.set(gameId, timer);
    },

    clear(gameId: string): void {
      cancel(gameId);
    },

    clearAll(): void {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    },
  };
}
