import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "./ratelimit";

beforeEach(() => resetRateLimits());

describe("rateLimit", () => {
  it("allows up to max then blocks with a retry hint", () => {
    for (let i = 0; i < 5; i++) expect(rateLimit("ip:1", 5, 60000).ok).toBe(true);
    const r = rateLimit("ip:1", 5, 60000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
    expect(rateLimit("ip:2", 5, 60000).ok).toBe(true);
  });
});
