import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resetRateLimits } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite hasta `limit` hits dentro de la ventana", () => {
    expect(checkRateLimit("k", 3, 60_000)).toBe(true);
    expect(checkRateLimit("k", 3, 60_000)).toBe(true);
    expect(checkRateLimit("k", 3, 60_000)).toBe(true);
    expect(checkRateLimit("k", 3, 60_000)).toBe(false);
  });

  it("libera cupo cuando la ventana desliza", () => {
    expect(checkRateLimit("k", 2, 60_000)).toBe(true);
    expect(checkRateLimit("k", 2, 60_000)).toBe(true);
    expect(checkRateLimit("k", 2, 60_000)).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit("k", 2, 60_000)).toBe(true);
  });

  it("aísla llaves distintas", () => {
    expect(checkRateLimit("a", 1, 60_000)).toBe(true);
    expect(checkRateLimit("a", 1, 60_000)).toBe(false);
    expect(checkRateLimit("b", 1, 60_000)).toBe(true);
  });

  it("un hit rechazado no extiende la ventana", () => {
    expect(checkRateLimit("k", 1, 60_000)).toBe(true);
    vi.advanceTimersByTime(50_000);
    // Rechazado, pero NO debe contar como hit nuevo.
    expect(checkRateLimit("k", 1, 60_000)).toBe(false);
    vi.advanceTimersByTime(11_000);
    // El hit original ya expiró: vuelve a haber cupo.
    expect(checkRateLimit("k", 1, 60_000)).toBe(true);
  });
});
