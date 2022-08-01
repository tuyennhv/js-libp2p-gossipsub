import type { PeerId } from '@libp2p/interface-peer-id';
import { RPC } from '../message/rpc.js';
import { PublishConfig, TopicStr, ValidateError } from '../types.js';
import { StrictSign, StrictNoSign } from '@libp2p/interface-pubsub';
export declare const SignPrefix: Uint8Array;
export declare function buildRawMessage(publishConfig: PublishConfig, topic: TopicStr, transformedData: Uint8Array): Promise<RPC.IMessage>;
export declare type ValidationResult = {
    valid: true;
    fromPeerId: PeerId | null;
} | {
    valid: false;
    error: ValidateError;
};
export declare function validateToRawMessage(signaturePolicy: typeof StrictNoSign | typeof StrictSign, msg: RPC.IMessage): Promise<ValidationResult>;
//# sourceMappingURL=buildRawMessage.d.ts.map