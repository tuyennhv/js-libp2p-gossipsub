declare type SimpleTimeCacheOpts = {
    validityMs: number;
};
/**
 * This is similar to https://github.com/daviddias/time-cache/blob/master/src/index.js
 * for our own need, we don't use lodash throttle to improve performance.
 * This gives 4x - 5x performance gain compared to npm TimeCache
 */
export declare class SimpleTimeCache<T> {
    private readonly entries;
    private readonly validityMs;
    constructor(opts: SimpleTimeCacheOpts);
    get size(): number;
    /**
     * Consumer should check for has() or get() before using this api.
     */
    put(key: string | number, value: T): void;
    /**
     * Similar to put but if there's an old entry, it'd delete old entry first.
     * This is to ensure validUntilMs is in ascending order in order to prune
     * to avoid memory leak.
     * See https://github.com/ChainSafe/js-libp2p-gossipsub/issues/356
     */
    putUnsafe(key: string | number, value: T): void;
    prune(): void;
    has(key: string | number): boolean;
    get(key: string | number): T | undefined;
    clear(): void;
}
export {};
//# sourceMappingURL=time-cache.d.ts.map