import { Components } from '@libp2p/components';
import type { EventEmitter } from '@libp2p/interfaces/events';
import { GossipsubEvents } from '../../src/index.js';
export declare const checkReceivedSubscription: (node: Components, peerIdStr: string, topic: string, peerIdx: number, timeout?: number) => Promise<void>;
export declare const checkReceivedSubscriptions: (node: Components, peerIdStrs: string[], topic: string, timeout?: number) => Promise<void>;
export declare const awaitEvents: <Events = GossipsubEvents>(emitter: EventEmitter<Events>, event: keyof Events, number: number, timeout?: number) => Promise<void>;
//# sourceMappingURL=events.d.ts.map