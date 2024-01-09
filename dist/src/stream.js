import { abortableSource } from 'abortable-iterator';
import { encode, decode } from 'it-length-prefixed';
import { pipe } from 'it-pipe';
import { pushable } from 'it-pushable';
export class OutboundStream {
    rawStream;
    pushable;
    lpPushable;
    closeController;
    maxBufferSize;
    constructor(rawStream, errCallback, opts) {
        this.rawStream = rawStream;
        this.pushable = pushable({ objectMode: false });
        this.lpPushable = pushable({ objectMode: false });
        this.closeController = new AbortController();
        this.maxBufferSize = opts.maxBufferSize ?? Infinity;
        pipe(abortableSource(this.pushable, this.closeController.signal, { returnOnAbort: true }), (source) => encode(source), this.rawStream).catch(errCallback);
        pipe(abortableSource(this.lpPushable, this.closeController.signal, { returnOnAbort: true }), this.rawStream).catch(errCallback);
    }
    get protocol() {
        // TODO remove this non-nullish assertion after https://github.com/libp2p/js-libp2p-interfaces/pull/265 is incorporated
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.rawStream.protocol;
    }
    push(data) {
        if (this.pushable.readableLength > this.maxBufferSize) {
            throw Error(`OutboundStream buffer full, size > ${this.maxBufferSize}`);
        }
        this.pushable.push(data);
    }
    /**
     * Same to push() but this is prefixed data so no need to encode length prefixed again
     */
    pushPrefixed(data) {
        if (this.lpPushable.readableLength > this.maxBufferSize) {
            throw Error(`OutboundStream buffer full, size > ${this.maxBufferSize}`);
        }
        this.lpPushable.push(data);
    }
    async close() {
        this.closeController.abort();
        // similar to pushable.end() but clear the internal buffer
        await this.pushable.return();
        await this.lpPushable.return();
        await this.rawStream.close();
    }
}
export class InboundStream {
    source;
    rawStream;
    closeController;
    constructor(rawStream, opts = {}) {
        this.rawStream = rawStream;
        this.closeController = new AbortController();
        this.source = abortableSource(pipe(this.rawStream, (source) => decode(source, opts)), this.closeController.signal, {
            returnOnAbort: true
        });
    }
    async close() {
        this.closeController.abort();
        await this.rawStream.close();
    }
}
//# sourceMappingURL=stream.js.map