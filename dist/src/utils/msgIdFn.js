import { sha256 } from 'multiformats/hashes/sha2';
import { msgId } from '@libp2p/pubsub/utils';
/**
 * Generate a message id, based on the `key` and `seqno`
 */
export function msgIdFnStrictSign(msg) {
    // Should never happen
    if (msg.sequenceNumber == null)
        throw Error('missing seqno field');
    // TODO: Should use .from here or key?
    return msgId(msg.from.toBytes(), msg.sequenceNumber);
}
/**
 * Generate a message id, based on message `data`
 */
export async function msgIdFnStrictNoSign(msg) {
    return await sha256.encode(msg.data);
}
//# sourceMappingURL=msgIdFn.js.map