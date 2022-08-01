import { abortableSource } from 'abortable-iterator';
import { pipe } from 'it-pipe';
import { pushable } from 'it-pushable';
import { encode, decode } from 'it-length-prefixed';
export class OutboundStream {
    constructor(rawStream, errCallback) {
        this.rawStream = rawStream;
        this.pushable = pushable();
        this.closeController = new AbortController();
        pipe(abortableSource(this.pushable, this.closeController.signal, { returnOnAbort: true }), encode(), this.rawStream).catch(errCallback);
    }
    get protocol() {
        // TODO remove this non-nullish assertion after https://github.com/libp2p/js-libp2p-interfaces/pull/265 is incorporated
        return this.rawStream.stat.protocol;
    }
    push(data) {
        this.pushable.push(data);
    }
    close() {
        this.closeController.abort();
        this.rawStream.close();
    }
}
export class InboundStream {
    constructor(rawStream) {
        this.rawStream = rawStream;
        this.closeController = new AbortController();
        this.source = abortableSource(pipe(this.rawStream, decode()), this.closeController.signal, { returnOnAbort: true });
    }
    close() {
        this.closeController.abort();
        this.rawStream.close();
    }
}
//# sourceMappingURL=stream.js.map