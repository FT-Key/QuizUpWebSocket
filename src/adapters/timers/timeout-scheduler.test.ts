import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTimeoutScheduler } from "./timeout-scheduler.js";

describe("TimeoutScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispara onTimeout exactamente al cumplirse el delay", () => {
    const scheduler = createTimeoutScheduler();
    const onTimeout = vi.fn();

    scheduler.scheduleQuestionTimeout("123456", 1_000, onTimeout);

    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("reprograma una partida cancelando el timeout anterior", () => {
    const scheduler = createTimeoutScheduler();
    const first = vi.fn();
    const second = vi.fn();

    scheduler.scheduleQuestionTimeout("123456", 1_000, first);
    vi.advanceTimersByTime(500);
    scheduler.scheduleQuestionTimeout("123456", 400, second);

    // A los 1_000ms del primero: si no se hubiese cancelado, ya habría disparado.
    vi.advanceTimersByTime(500);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("clear cancela el timeout de la partida", () => {
    const scheduler = createTimeoutScheduler();
    const onTimeout = vi.fn();

    scheduler.scheduleQuestionTimeout("123456", 1_000, onTimeout);
    scheduler.clear("123456");

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("clearAll cancela todos los timeouts programados", () => {
    const scheduler = createTimeoutScheduler();
    const first = vi.fn();
    const second = vi.fn();

    scheduler.scheduleQuestionTimeout("111111", 1_000, first);
    scheduler.scheduleQuestionTimeout("222222", 2_000, second);
    scheduler.clearAll();

    vi.advanceTimersByTime(10_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });
});
