import { describe, expect, it } from "vitest";
import { compareSignatures, formatComparisonFailure } from "./compare";
import { formatSignature, parseSignature } from "./signature";

describe("oracle signature comparator", () => {
  it("compares producer text signatures without producer internals", () => {
    const simulator = parseSignature("fixture=load-store\nx1=0x80010000\nmem[data+0]=0x0000002a\n");
    const qemu = parseSignature("fixture=load-store\nx1=0x80010000\nmem[data+0]=0x0000002a\n");

    expect(compareSignatures(simulator, qemu)).toEqual({ ok: true, mismatches: [] });
  });

  it("classifies register, memory, and missing-key mismatches", () => {
    const comparison = compareSignatures(
      parseSignature("fixture=load-store\nx1=0x00000001\nmem[data+0]=0x00000000\n"),
      parseSignature("fixture=load-store\nx1=0x00000002\nmem[data+0]=0x0000002a\nx2=0x00000003\n"),
    );

    expect(comparison.ok).toBe(false);
    expect(comparison.mismatches).toMatchObject([
      { key: "mem[data+0]", classification: "memory-observable-state" },
      { key: "x1", classification: "register-observable-state" },
      { key: "x2", classification: "producer-output" },
    ]);
    expect(formatComparisonFailure("load-store", comparison.mismatches)).toContain(
      "classification=memory-observable-state",
    );
  });

  it("keeps signatures as normalized key-value text", () => {
    expect(
      formatSignature([
        { key: "fixture", value: "add" },
        { key: "x1", value: "0x00000007" },
      ]),
    ).toBe("fixture=add\nx1=0x00000007\n");
  });
});
