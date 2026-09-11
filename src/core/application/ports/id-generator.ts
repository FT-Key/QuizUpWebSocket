export interface IdGenerator {
  /** Genera un identificador único nuevo (formato UUID v4, como el código actual). */
  next(): string;
}
