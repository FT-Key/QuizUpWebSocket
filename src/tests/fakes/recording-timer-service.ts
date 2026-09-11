import type { TimeoutHandler, TimerService } from "../../core/application/ports/timer-service.js";

export interface ScheduledTimeout {
  gameId: string;
  delayMs: number;
  onTimeout: TimeoutHandler;
}

export interface RecordingTimerService extends TimerService {
  readonly scheduled: ScheduledTimeout[];
  readonly cleared: string[];
  readonly clearAllCalls: number;
}

/**
 * `TimerService` de test (US-06): registra programaciones y limpiezas y expone
 * el callback para poder dispararlo a mano, sin timers reales.
 */
export function createRecordingTimerService(): RecordingTimerService {
  const scheduled: ScheduledTimeout[] = [];
  const cleared: string[] = [];
  let clearAllCalls = 0;

  return {
    scheduled,
    cleared,
    get clearAllCalls() {
      return clearAllCalls;
    },
    scheduleQuestionTimeout(gameId, delayMs, onTimeout) {
      scheduled.push({ gameId, delayMs, onTimeout });
    },
    clear(gameId) {
      cleared.push(gameId);
    },
    clearAll() {
      clearAllCalls += 1;
    },
  };
}
