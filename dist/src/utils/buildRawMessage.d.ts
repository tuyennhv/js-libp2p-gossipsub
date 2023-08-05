import { RPC } from '../message/rpc.js';
import { PublishConfig, TopicStr, ValidateError } from '../types.js';
import { StrictSign, StrictNoSign, Message } from '@libp2p/interface-pubsub';
export declare const SignPrefix: Uint8Array;
export type RawMessageAndMessage = {
    raw: RPC.Message;
    msg: Message;
};
export declare function buildRawMessage(publishConfig: PublishConfig, topic: TopicStr, originalData: Uint8Array, transformedData: Uint8Array): Promise<RawMessageAndMessage>;
export type ValidationResult = {
    valid: true;
    message: Message;
} | {
    valid: false;
    error: ValidateError;
};
export declare function validateToRawMessage(signaturePolicy: typeof StrictNoSign | typeof StrictSign, msg: RPC.Message): Promise<ValidationResult>;
//# sourceMappingURL=buildRawMessage.d.ts.map