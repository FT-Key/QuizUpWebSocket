/**
 * Tests de `TimeBonusScoring` (US-04).
 *
 * Los valores espejo provienen de `src/gameStore.test.ts` (US-01), que ejecuta
 * la misma fórmula con el reloj real: 2001, 1950, 1, 0.
 */
import { describe, expect, it } from "vitest";
import { TimeBonusScoring } from "./time-bonus-scoring.js";

const scoring = new TimeBonusScoring();

describe("TimeBonusScoring — 1 + floor(remainingMs / 10) si acierta (paridad gameStore)", () => {
  it("acierto recién iniciada la pregunta suma 1 + bonus completo: remainingMs 20000 ⇒ 2001", () => {
    expect(scoring.calculate({ isCorrect: true, remainingMs: 20000 })).toBe(2001);
  });

  it("acierto con 504 ms transcurridos trunca el decimal: remainingMs 19496 ⇒ 1950", () => {
    expect(scoring.calculate({ isCorrect: true, remainingMs: 19496 })).toBe(1950);
  });

  it("acierto justo al agotarse el tiempo (remainingMs 0) suma solo 1", () => {
    expect(scoring.calculate({ isCorrect: true, remainingMs: 0 })).toBe(1);
  });

  it("acierto después del límite (remainingMs -1) suma solo 1", () => {
    expect(scoring.calculate({ isCorrect: true, remainingMs: -1 })).toBe(1);
  });

  it("fallo con tiempo de sobra suma 0", () => {
    expect(scoring.calculate({ isCorrect: false, remainingMs: 20000 })).toBe(0);
  });

  it("fallo a tiempo agotado suma 0", () => {
    expect(scoring.calculate({ isCorrect: false, remainingMs: 0 })).toBe(0);
  });

  it("el bonus trunca decimales: remainingMs 9 ⇒ 1; remainingMs 10 ⇒ 2", () => {
    expect(scoring.calculate({ isCorrect: true, remainingMs: 9 })).toBe(1);
    expect(scoring.calculate({ isCorrect: true, remainingMs: 10 })).toBe(2);
  });
});
