export type TimeoutHandler = () => void | Promise<void>;

export interface TimerService {
  /** Programa el fin de la pregunta de `gameId` en `delayMs` ms (reemplaza al timeout si ya existía). */
  scheduleQuestionTimeout(gameId: string, delayMs: number, onTimeout: TimeoutHandler): void;

  /** Cancela el timer de la partida (equivale a `clearQuestionTimeout`). */
  clear(gameId: string): void;

  /** Cancela todos los timers (apagado ordenado, US-08). */
  clearAll(): void;
}
