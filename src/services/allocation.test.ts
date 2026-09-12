import { describe, expect, it } from "vitest";
import { computeAllocations } from "./allocation.js";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("computeAllocations", () => {
  it("covers the oldest charge from the oldest payment", () => {
    const rows = computeAllocations(
      [
        { id: "c2", amountCents: 13000, chargedOn: d("2026-03-20") },
        { id: "c1", amountCents: 7000, chargedOn: d("2026-03-15") },
      ],
      [
        { id: "p2", amountCents: 130000, paidOn: d("2026-03-23") },
        { id: "p1", amountCents: 7000, paidOn: d("2026-03-15") },
      ],
    );
    expect(rows).toEqual([
      { chargeId: "c1", paymentId: "p1", amountCents: 7000 },
      { chargeId: "c2", paymentId: "p2", amountCents: 13000 },
    ]);
  });

  it("splits one charge across two payments and one payment across two charges", () => {
    const rows = computeAllocations(
      [
        { id: "c1", amountCents: 15000, chargedOn: d("2026-01-01") },
        { id: "c2", amountCents: 15000, chargedOn: d("2026-01-08") },
      ],
      [
        { id: "p1", amountCents: 10000, paidOn: d("2026-01-01") },
        { id: "p2", amountCents: 20000, paidOn: d("2026-01-05") },
      ],
    );
    expect(rows).toEqual([
      { chargeId: "c1", paymentId: "p1", amountCents: 10000 },
      { chargeId: "c1", paymentId: "p2", amountCents: 5000 },
      { chargeId: "c2", paymentId: "p2", amountCents: 15000 },
    ]);
  });

  it("never gives a charge more than its amount or takes more than a payment has", () => {
    const rows = computeAllocations(
      [{ id: "c1", amountCents: 13000, chargedOn: d("2026-03-20") }],
      [{ id: "p1", amountCents: 14000, paidOn: d("2026-03-23") }],
    );
    expect(rows).toEqual([{ chargeId: "c1", paymentId: "p1", amountCents: 13000 }]);
  });

  it("ignores refunds and credit adjustments", () => {
    const rows = computeAllocations(
      [
        { id: "c1", amountCents: 10000, chargedOn: d("2026-01-01") },
        { id: "credit", amountCents: -5000, chargedOn: d("2026-01-02") },
      ],
      [
        { id: "p1", amountCents: 10000, paidOn: d("2026-01-01") },
        { id: "refund", amountCents: -3000, paidOn: d("2026-01-03") },
      ],
    );
    expect(rows).toEqual([{ chargeId: "c1", paymentId: "p1", amountCents: 10000 }]);
  });

  it("leaves charges uncovered when money runs out, oldest covered first", () => {
    const rows = computeAllocations(
      [
        { id: "c1", amountCents: 10000, chargedOn: d("2026-01-01") },
        { id: "c2", amountCents: 10000, chargedOn: d("2026-01-08") },
        { id: "c3", amountCents: 10000, chargedOn: d("2026-01-15") },
      ],
      [{ id: "p1", amountCents: 15000, paidOn: d("2026-01-01") }],
    );
    expect(rows).toEqual([
      { chargeId: "c1", paymentId: "p1", amountCents: 10000 },
      { chargeId: "c2", paymentId: "p1", amountCents: 5000 },
    ]);
  });

  it("is deterministic when dates tie, by id", () => {
    const a = computeAllocations(
      [
        { id: "b", amountCents: 100, chargedOn: d("2026-01-01") },
        { id: "a", amountCents: 100, chargedOn: d("2026-01-01") },
      ],
      [{ id: "p", amountCents: 100, paidOn: d("2026-01-01") }],
    );
    expect(a).toEqual([{ chargeId: "a", paymentId: "p", amountCents: 100 }]);
  });

  it("returns nothing with no payments", () => {
    expect(computeAllocations([{ id: "c1", amountCents: 100, chargedOn: d("2026-01-01") }], [])).toEqual([]);
  });
});
