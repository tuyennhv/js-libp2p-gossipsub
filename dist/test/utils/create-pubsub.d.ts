import { Components } from '@libp2p/components';
import { GossipsubOpts } from '../../src/index.js';
import { PubSub } from '@libp2p/interface-pubsub';
export interface CreateComponentsOpts {
    init?: Partial<GossipsubOpts>;
    pubsub?: {
        new (opts?: any): PubSub;
    };
}
export declare const createComponents: (opts: CreateComponentsOpts) => Promise<Components>;
export declare const createComponentsArray: (opts?: CreateComponentsOpts & {
    number: number;
    connected?: boolean;
}) => Promise<Components[]>;
export declare const connectPubsubNodes: (componentsA: Components, componentsB: Components) => Promise<void>;
export declare const connectAllPubSubNodes: (components: Components[]) => Promise<void>;
/**
 * Connect some gossipsub nodes to others, ensure each has num peers
 * @param {Gossipsub[]} gss
 * @param {number} num number of peers to connect
 */
export declare function connectSome(gss: Components[], num: number): Promise<void>;
export declare function sparseConnect(gss: Components[]): Promise<void>;
export declare function denseConnect(gss: Components[]): Promise<void>;
//# sourceMappingURL=create-pubsub.d.ts.map