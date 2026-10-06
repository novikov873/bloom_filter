# Bloom Filter

A small, zero-dependency Bloom filter for JavaScript (ESM). You tell it how many
elements you expect and how often you are willing to tolerate a false positive;
it sizes the bit array and the number of hash functions accordingly and gives
you `add` and `has`.

```js
import { BloomFilter } from "./src/index.js";

const bf = new BloomFilter({ capacity: 1000, errorRate: 0.01 });
bf.add("alice@example.org");
bf.has("alice@example.org"); // true
bf.has("bob@example.org");   // false (almost certainly)
```

Exports:
- `BloomFilter` (class) with constructor `({ capacity, errorRate })`,
  instance methods `add(key)`, `has(key)`, `countSetBits()`, and getters
  `size`, `hashCount`.

## Why this exists

The problem is set-membership testing with no false negatives and bounded
memory. A Bloom filter trades a tunable false-positive rate for a large
reduction in space: instead of storing the elements, it stores a compact bit
array and synthesizes multiple hashes per key. This library picks the standard
formulas for bit length `m` and hash count `k` from `capacity` and `errorRate`,
and uses the Kirsch-Mitzenmacher double-hashing trick (two base hashes,
`h1 + i * h2`) so the implementation needs only one underlying hash function.
FNV-1a 32-bit is used for that function — not cryptographic, but adequate and
fully self-contained.

## Edge you will hit

The target `errorRate` is honored at the stated `capacity`. Once you insert
more than `capacity` elements the false-positive rate climbs above the target;
that is by design, not a bug. The filter never produces false negatives: if
`add(x)` was called, `has(x)` returns `true` forever.

Key coercion is `String(key)`, so `add(42)` and `add("42")` occupy the same
slot. Pass strings if you care about that distinction.
