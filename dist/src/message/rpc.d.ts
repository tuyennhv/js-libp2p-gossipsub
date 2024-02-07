import { type Codec } from 'protons-runtime';
import type { Uint8ArrayList } from 'uint8arraylist';
export interface RPC {
    subscriptions: RPC.SubOpts[];
    messages: RPC.Message[];
    control?: RPC.ControlMessage;
}
export declare namespace RPC {
    interface SubOpts {
        subscribe?: boolean;
        topic?: string;
    }
    namespace SubOpts {
        const codec: () => Codec<SubOpts>;
        const encode: (obj: Partial<SubOpts>) => Uint8Array;
        const decode: (buf: Uint8Array | Uint8ArrayList) => SubOpts;
    }
    interface Message {
        from?: Uint8Array;
        data?: Uint8Array;
        seqno?: Uint8Array;
        topic: string;
        signature?: Uint8Array;
        key?: Uint8Array;
    }
    namespace Message {
        const codec: () => Codec<Message>;
        const encode: (obj: Partial<Message>) => Uint8Array;
        const decode: (buf: Uint8Array | Uint8ArrayList) => Message;
    }
    interface ControlMessage {
        ihave: RPC.ControlIHave[];
        iwant: RPC.ControlIWant[];
        graft: RPC.ControlGraft[];
        prune: RPC.ControlPrune[];
    }
    namespace ControlMessage {
        const codec: () => Codec<ControlMessage>;
        const encode: (obj: Partial<ControlMessage>) => Uint8Array;
        const decode: (buf: Uint8Array | Uint8ArrayList) => ControlMessage;
    }
    interface ControlIHave {
        topicID?: string;
        messageIDs: Uint8Array[];
    }
    namespace ControlIHave {
        const codec: () => Codec<ControlIHave>;
        const encode: (obj: Partial<ControlIHave>) => Uint8Array;
        const decode: (buf: Uint8Array | Uint8ArrayList) => ControlIHave;
    }
    interface ControlIWant {
        messageIDs: Uint8Array[];
    }
    namespace ControlIWant {
        const codec: () => Codec<ControlIWant>;
        const encode: (obj: Partial<ControlIWant>) => Uint8Array;
        const decode: (buf: Uint8Array | Uint8ArrayList) => ControlIWant;
    }
    interface ControlGraft {
        topicID?: string;
    }
    namespace ControlGraft {
        const codec: () => Codec<ControlGraft>;
        const encode: (obj: Partial<ControlGraft>) => Uint8Array;
        const decode: (buf: Uint8Array | Uint8ArrayList) => ControlGraft;
    }
    interface ControlPrune {
        topicID?: string;
        peers: RPC.PeerInfo[];
        backoff?: number;
    }
    namespace ControlPrune {
        const codec: () => Codec<ControlPrune>;
        const encode: (obj: Partial<ControlPrune>) => Uint8Array;
        const decode: (buf: Uint8Array | Uint8ArrayList) => ControlPrune;
    }
    interface PeerInfo {
        peerID?: Uint8Array;
        signedPeerRecord?: Uint8Array;
    }
    namespace PeerInfo {
        const codec: () => Codec<PeerInfo>;
        const encode: (obj: Partial<PeerInfo>) => Uint8Array;
        const decode: (buf: Uint8Array | Uint8ArrayList) => PeerInfo;
    }
    const codec: () => Codec<RPC>;
    const encode: (obj: Partial<RPC>) => Uint8Array;
    const decode: (buf: Uint8Array | Uint8ArrayList) => RPC;
}
//# sourceMappingURL=rpc.d.ts.map