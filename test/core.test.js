import { test } from "node:test";
import assert from "node:assert/strict";
import { BloomFilter } from "../src/index.js";

test("rejects non-positive capacity", () => {
  assert.throws(() => new BloomFilter({ capacity: 0, errorRate: 0.01 }), RangeError);
  assert.throws(() => new BloomFilter({ capacity: -5, errorRate: 0.01 }), RangeError);
  assert.throws(() => new BloomFilter({ capacity: 1.5, errorRate: 0.01 }), RangeError);
});

test("rejects error rate outside (0, 1)", () => {
  assert.throws(() => new BloomFilter({ capacity: 100, errorRate: 0 }), RangeError);
  assert.throws(() => new BloomFilter({ capacity: 100, errorRate: 1 }), RangeError);
  assert.throws(() => new BloomFilter({ capacity: 100, errorRate: 1.5 }), RangeError);
  assert.throws(() => new BloomFilter({ capacity: 100, errorRate: -0.1 }), RangeError);
});

test("empty filter reports absence for any key", () => {
  const bf = new BloomFilter({ capacity: 100, errorRate: 0.01 });
  assert.equal(bf.has("anything"), false);
  assert.equal(bf.has(""), false);
});

test("has returns true after add", () => {
  const bf = new BloomFilter({ capacity: 100, errorRate: 0.01 });
  bf.add("hello");
  assert.equal(bf.has("hello"), true);
  assert.equal(bf.has("hell"), false);
});

test("add is chainable", () => {
  const bf = new BloomFilter({ capacity: 100, errorRate: 0.01 });
  const out = bf.add("a").add("b");
  assert.equal(out, bf);
  assert.equal(bf.has("a"), true);
  assert.equal(bf.has("b"), true);
});

test("numeric and boolean keys are coerced consistently", () => {
  const bf = new BloomFilter({ capacity: 50, errorRate: 0.01 });
  bf.add(42);
  assert.equal(bf.has(42), true);
  assert.equal(bf.has("42"), true); // documented coercion
  assert.equal(bf.has("43"), false);
  bf.add(true);
  assert.equal(bf.has(true), true);
  assert.equal(bf.has("true"), true);
});

test("empty string key is a real key", () => {
  const bf = new BloomFilter({ capacity: 50, errorRate: 0.01 });
  bf.add("");
  assert.equal(bf.has(""), true);
});

test("different strings generally probe different bits", () => {
  const bf = new BloomFilter({ capacity: 100, errorRate: 0.01 });
  bf.add("alpha");
  const before = bf.countSetBits();
  bf.add("beta");
  const after = bf.countSetBits();
  // "alpha" and "beta" do not hash to the same bit set; after must be strictly greater.
  assert.ok(after > before, `expected ${after} > ${before}`);
});

test("re-adding an existing key sets no new bits", () => {
  const bf = new BloomFilter({ capacity: 100, errorRate: 0.01 });
  bf.add("x");
  const after1 = bf.countSetBits();
  bf.add("x");
  const after2 = bf.countSetBits();
  assert.equal(after2, after1);
});

test("false positive rate stays near target at capacity", () => {
  // Deterministic: we check a fixed set of absent keys against a known-populated filter.
  const capacity = 1000;
  const errorRate = 0.05;
  const bf = new BloomFilter({ capacity, errorRate });

  for (let i = 0; i < capacity; i++) {
    bf.add("present-" + i);
  }

  // Every inserted key MUST be present (no false negatives).
  for (let i = 0; i < capacity; i++) {
    assert.equal(bf.has("present-" + i), true);
  }

  // Count false positives over a fixed absent set. Empirical rate must be reasonable.
  const absent = 2000;
  let fp = 0;
  for (let i = 0; i < absent; i++) {
    if (bf.has("absent-" + i)) fp++;
  }
  const rate = fp / absent;
  // At target 0.05 with capacity == n, a rate over 0.25 would indicate a real bug.
  assert.ok(rate < 0.25, `false positive rate too high: ${rate}`);
});

test("over-capacity usage still avoids false negatives", () => {
  // Deliberately exceed capacity; false positives rise but the invariant holds.
  const bf = new BloomFilter({ capacity: 50, errorRate: 0.01 });
  for (let i = 0; i < 500; i++) {
    bf.add("k-" + i);
  }
  for (let i = 0; i < 500; i++) {
    assert.equal(bf.has("k-" + i), true);
  }
});

test("hashCount and size are positive", () => {
  const bf = new BloomFilter({ capacity: 100, errorRate: 0.01 });
  assert.ok(bf.size > 0);
  assert.ok(bf.hashCount > 0);
});
