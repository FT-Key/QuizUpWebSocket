import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCleanupScheduler } from "./cleanup-scheduler.js";

describe("CleanupScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("start ejecuta run de inmediato", () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const scheduler = createCleanupScheduler({ run, intervalMs: 1_000 });

    scheduler.start();

    expect(run).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("vuelve a ejecutar run cada intervalMs", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const scheduler = createCleanupScheduler({ run, intervalMs: 1_000 });

    scheduler.start();
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(3);

    scheduler.stop();
  });

  it("stop detiene el intervalo", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const scheduler = createCleanupScheduler({ run, intervalMs: 1_000 });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("un run que rechaza llama a onError y no corta el ciclo", async () => {
    const failure = new Error("cleanup boom");
    const run = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const onError = vi.fn();
    const scheduler = createCleanupScheduler({ run, intervalMs: 1_000, onError });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(failure);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });
});
