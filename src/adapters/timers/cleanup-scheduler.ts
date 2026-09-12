/**
 * Scheduler del cleanup periódico (US-08, Observer sobre `setInterval`):
 * ejecuta `run` de inmediato al arrancar (paridad `startStaleGamesCleanup`) y
 * cada `intervalMs` (default 5 min). El timer va `unref()` para no retener el
 * proceso; los rechazos se derivan a `onError` (nunca como
 * `unhandledRejection`) y jamás interrumpen el intervalo.
 */
export interface CleanupScheduler {
  start(): void;
  stop(): void;
}

export interface CleanupSchedulerDeps {
  run: () => Promise<void>;
  /** Intervalo entre ejecuciones (default 5 * 60 * 1000, paridad legacy). */
  intervalMs?: number;
  /** Manejo de errores de `run` (default: noop); el caller decide cómo loguear. */
  onError?: (error: unknown) => void;
}

export const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export function createCleanupScheduler(deps: CleanupSchedulerDeps): CleanupScheduler {
  const { run, intervalMs = DEFAULT_CLEANUP_INTERVAL_MS, onError } = deps;
  let timer: NodeJS.Timeout | undefined;

  const execute = (): void => {
    void run().catch((error: unknown) => {
      onError?.(error); // best-effort: sin onError el fallo del ciclo se degrada (main lo inyecta siempre)
    });
  };

  return {
    start(): void {
      execute();
      timer = setInterval(execute, intervalMs);
      timer.unref?.();
    },

    stop(): void {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    },
  };
}
