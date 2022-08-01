import { Stream } from '@libp2p/interface-connection';
export declare class OutboundStream {
    private readonly rawStream;
    private readonly pushable;
    private readonly closeController;
    constructor(rawStream: Stream, errCallback: (e: Error) => void);
    get protocol(): string;
    push(data: Uint8Array): void;
    close(): void;
}
export declare class InboundStream {
    readonly source: AsyncIterable<Uint8Array>;
    private readonly rawStream;
    private readonly closeController;
    constructor(rawStream: Stream);
    close(): void;
}
//# sourceMappingURL=stream.d.ts.map