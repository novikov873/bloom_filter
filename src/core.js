/**
 * Double-hashing Bloom filter.
 *
 * Uses two base hash functions derived from a single 32-bit FNV-1a of the input,
 * then synthesizes k independent-ish probes via (h1 + i * h2). This is the
 * Kirsch-Mitzenmacher trick: it collapses k hashes to two without wrecking
 * the false-positive rate in practice. We avoid double hashing when h2 is 0
 * (all probes would collapse to h1) by remapping h2 to a fixed odd constant.
 *
 * Capacity and error rate are honored at construction: m and k are derived
 * from them, not guessed. The filter will exceed the target rate once n grows
 * past capacity — that is the documented edge, not a bug.
 */

export class BloomFilter {
  #bitLength;
  #hashCount;
  #bits;

  /**
   * @param {object} opts
   * @param {number} opts.capacity  Expected number of elements n.
 * @param {number} opts.errorRate Target false-positive probability in [0,1). 0 and 1 are rejected: 0 is impossible, 1 is useless.
   */
  constructor({ capacity, errorRate }) {
    if (!Number.isFinite(capacity) || !Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError("capacity must be a positive integer");
    }
    if (
      !Number.isFinite(errorRate) ||
      errorRate <= 0 ||
      errorRate >= 1
    ) {
      throw new RangeError("errorRate must be in (0, 1)");
    }

    const ln2 = Math.LN2;
    const mNum = (-capacity * Math.log(errorRate)) / (ln2 * ln2);
    const m = Math.max(1, Math.ceil(mNum));
    const kNum = (m / capacity) * ln2;
    const k = Math.max(1, Math.round(kNum));

    this.#bitLength = m;
    this.#hashCount = k;
    this.#bits = new Uint8Array(Math.ceil(m / 8));
  }

  /** Number of bits in the filter. */
  get size() {
    return this.#bitLength;
  }

  /** Number of hash functions used per add/lookup. */
  get hashCount() {
    return this.#hashCount;
  }

  /** Estimated bits currently set. Mainly for tests and introspection. */
  countSetBits() {
    let c = 0;
    for (const b of this.#bits) {
      c += BIT_POP[b];
    }
    return c;
  }

  /**
   * Inserts a key. Returns this for chaining.
   * Coerces non-string keys via String(); undefined and null become "undefined"/"null",
   * which is deliberate rather than throwing — callers who care should stringify themselves.
   */
  add(key) {
    const s = key === undefined ? "undefined" : String(key);
    const { h1, h2 } = this.#hashPair(s);
    const remapped = h2 === 0 ? REMAP_CONST : h2;
    for (let i = 0; i < this.#hashCount; i++) {
      const idx = (h1 + i * remapped) % this.#bitLength;
      this.#setBit(idx);
    }
    return this;
  }

  /**
   * Returns true if the key MIGHT be present, false if it is definitely absent.
   * A false positive is possible (that is the filter's trade-off); a false negative is not.
   */
  has(key) {
    const s = key === undefined ? "undefined" : String(key);
    const { h1, h2 } = this.#hashPair(s);
    const remapped = h2 === 0 ? REMAP_CONST : h2;
    for (let i = 0; i < this.#hashCount; i++) {
      const idx = (h1 + i * remapped) % this.#bitLength;
      if (!this.#getBit(idx)) return false;
    }
    return true;
  }

  #setBit(i) {
    this.#bits[i >>> 3] |= 1 << (i & 7);
  }

  #getBit(i) {
    return (this.#bits[i >>> 3] >> (i & 7)) & 1;
  }

  /**
   * FNV-1a 32-bit. Chosen for zero dependencies, decent avalanche on short
   * keys, and a prime multiplier that scatters ASCII bytes well. It is not
   * cryptographically strong; a Bloom filter does not need that.
   */
  #fnv1a(str) {
    // FNV-1a's reference constant for the 32-bit variant.
    const FNV_OFFSET = 0x811c9dc5;
    const FNV_PRIME = 0x01000193;

    let hash = FNV_OFFSET;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      // JS bitwise ops work in 32 bits; multiply gives a double, coerce with >>>.
      hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
    return hash >>> 0;
  }

  /**
   * Derives (h1, h2) from one base hash. Splitting the 32-bit FNV output into
   * high/low 16-bit halves is simple and gives two adequately-independent
   * values for double hashing; using the full 32 bits as h1 maximizes its
   * entropy. h2 = high16 is fine for the multiplier.
   */
  #hashPair(str) {
    const h = this.#fnv1a(str);
    const h1 = h >>> 0;
    const h2 = (h >>> 16) | 0;
    return { h1, h2 };
  }
}

// Fixed nonzero odd constant used to break the h2=0 degenerate case in double hashing.
// Any odd nonzero value works; this is just a chosen prime to be explicit.
const REMAP_CONST = 0x100019;

// Per-byte popcount lookup so countSetBits stays O(m/8) with no per-bit loop.
const BIT_POP = new Uint8Array([
  0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4, 1, 2, 2, 3, 2, 3, 3, 4, 2, 3,
  3, 4, 3, 4, 4, 5, 1, 2, 2, 3, 2, 3, 3, 4, 2, 3, 3, 4, 3, 4, 4, 5, 2, 3, 3, 4, 3,
  4, 4, 5, 3, 4, 4, 5, 4, 5, 5, 6, 1, 2, 2, 3, 2, 3, 3, 4, 2, 3, 3, 4, 3, 4, 4, 5,
  2, 3, 3, 4, 3, 4, 4, 5, 3, 4, 4, 5, 4, 5, 5, 6, 2, 3, 3, 4, 3, 4, 4, 5, 3, 4, 4,
  5, 4, 5, 5, 6, 3, 4, 4, 5, 4, 5, 5, 6, 4, 5, 5, 6, 5, 6, 6, 7, 1, 2, 2, 3, 2, 3,
  3, 4, 2, 3, 3, 4, 3, 4, 4, 5, 2, 3, 3, 4, 3, 4, 4, 5, 3, 4, 4, 5, 4, 5, 5, 6, 2,
  3, 3, 4, 3, 4, 4, 5, 3, 4, 4, 5, 4, 5, 5, 6, 3, 4, 4, 5, 4, 5, 5, 6, 4, 5, 5, 6,
  5, 6, 6, 7, 2, 3, 3, 4, 3, 4, 4, 5, 3, 4, 4, 5, 4, 5, 5, 6, 3, 4, 4, 5, 4, 5, 5,
  6, 4, 5, 5, 6, 5, 6, 6, 7, 3, 4, 4, 5, 4, 5, 5, 6, 4, 5, 5, 6, 5, 6, 6, 7, 4, 5,
  5, 6, 5, 6, 6, 7, 5, 6, 6, 7, 6, 7, 7, 8,
]);
