import type { GossipSubAndComponents } from './create-pubsub.js';
import type { GossipsubEvents } from '../../src/index.js';
import type { TypedEventTarget } from '@libp2p/interface/events';
export declare const checkReceivedSubscription: (node: GossipSubAndComponents, peerIdStr: string, topic: string, peerIdx: number, timeout?: number) => Promise<void>;
export declare const checkReceivedSubscriptions: (node: GossipSubAndComponents, peerIdStrs: string[], topic: string, timeout?: number) => Promise<void>;
export declare const awaitEvents: <Events extends Record<string, any> = GossipsubEvents>(emitter: TypedEventTarget<Events>, event: keyof Events, number: number, timeout?: number) => Promise<void>;
//# sourceMappingURL=events.d.ts.map