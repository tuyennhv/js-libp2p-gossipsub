/**
 * This is similar to https://github.com/daviddias/time-cache/blob/master/src/index.js
 * for our own need, we don't use lodash throttle to improve performance.
 * This gives 4x - 5x performance gain compared to npm TimeCache
 */
export class SimpleTimeCache {
    constructor(opts) {
        this.entries = new Map();
        this.validityMs = opts.validityMs;
        // allow negative validityMs so that this does not cache anything, spec test compliance.spec.js
        // sends duplicate messages and expect peer to receive all. Application likely uses positive validityMs
    }
    get size() {
        return this.entries.size;
    }
    /**
     * Consumer should check for has() or get() before using this api.
     */
    put(key, value) {
        this.entries.set(key, { value, validUntilMs: Date.now() + this.validityMs });
    }
    /**
     * Similar to put but if there's an old entry, it'd delete old entry first.
     * This is to ensure validUntilMs is in ascending order in order to prune
     * to avoid memory leak.
     * See https://github.com/ChainSafe/js-libp2p-gossipsub/issues/356
     */
    putUnsafe(key, value) {
        if (this.has(key))
            this.entries.delete(key);
        this.put(key, value);
    }
    prune() {
        const now = Date.now();
        for (const [k, v] of this.entries.entries()) {
            if (v.validUntilMs < now) {
                this.entries.delete(k);
            }
            else {
                // sort by insertion order
                break;
            }
        }
    }
    has(key) {
        return this.entries.has(key);
    }
    get(key) {
        const value = this.entries.get(key);
        return value && value.validUntilMs >= Date.now() ? value.value : undefined;
    }
    clear() {
        this.entries.clear();
    }
}
//# sourceMappingURL=time-cache.js.map