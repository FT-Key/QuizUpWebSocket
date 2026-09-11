export interface Clock {
  /** Epoch en milisegundos (equivalente al reloj del sistema). */
  now(): number;
}
