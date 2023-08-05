import pb from 'protobufjs';
export const defaultDecodeRpcLimits = {
    maxSubscriptions: Infinity,
    maxMessages: Infinity,
    maxIhaveMessageIDs: Infinity,
    maxIwantMessageIDs: Infinity,
    maxControlMessages: Infinity,
    maxPeerInfos: Infinity
};
/**
 * Copied code from src/message/rpc.ts but with decode limits to prevent OOM attacks
 */
export function decodeRpc(bytes, opts) {
    // Mutate to use the option as stateful counter. Must limit the total count of messageIDs across all IWANT, IHAVE
    // else one count put 100 messageIDs into each 100 IWANT and "get around" the limit
    opts = { ...opts };
    const reader = pb.Reader.create(bytes);
    const obj = {
        subscriptions: [],
        messages: []
    };
    const end = reader.len;
    while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
            case 1:
                if (obj.subscriptions.length < opts.maxSubscriptions) {
                    obj.subscriptions.push(decodeSubOpts(reader, reader.uint32()));
                }
                else
                    reader.skipType(tag & 7);
                // obj.subscriptions.push(RPC.SubOpts.codec().decode(reader, reader.uint32()))
                break;
            case 2:
                // obj.messages.push(RPC.Message.codec().decode(reader, reader.uint32()))
                if (obj.messages.length < opts.maxMessages)
                    obj.messages.push(decodeMessage(reader, reader.uint32()));
                else
                    reader.skipType(tag & 7);
                break;
            case 3:
                // obj.control = RPC.ControlMessage.codec().decode(reader, reader.uint32())
                obj.control = decodeControlMessage(reader, reader.uint32(), opts);
                break;
            default:
                reader.skipType(tag & 7);
                break;
        }
    }
    return obj;
}
function decodeSubOpts(reader, length) {
    const obj = {};
    const end = length == null ? reader.len : reader.pos + length;
    while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
            case 1:
                obj.subscribe = reader.bool();
                break;
            case 2:
                obj.topic = reader.string();
                break;
            default:
                reader.skipType(tag & 7);
                break;
        }
    }
    return obj;
}
function decodeMessage(reader, length) {
    const obj = {
        topic: ''
    };
    const end = length == null ? reader.len : reader.pos + length;
    while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
            case 1:
                obj.from = reader.bytes();
                break;
            case 2:
                obj.data = reader.bytes();
                break;
            case 3:
                obj.seqno = reader.bytes();
                break;
            case 4:
                obj.topic = reader.string();
                break;
            case 5:
                obj.signature = reader.bytes();
                break;
            case 6:
                obj.key = reader.bytes();
                break;
            default:
                reader.skipType(tag & 7);
                break;
        }
    }
    if (obj.topic == null) {
        throw new Error('Protocol error: value for required field "topic" was not found in protobuf');
    }
    return obj;
}
function decodeControlMessage(reader, length, opts) {
    const obj = {
        ihave: [],
        iwant: [],
        graft: [],
        prune: []
    };
    const end = length == null ? reader.len : reader.pos + length;
    while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
            case 1:
                // obj.ihave.push(RPC.ControlIHave.codec().decode(reader, reader.uint32()))
                if (obj.ihave.length < opts.maxControlMessages) {
                    obj.ihave.push(decodeControlIHave(reader, reader.uint32(), opts));
                }
                else
                    reader.skipType(tag & 7);
                break;
            case 2:
                // obj.iwant.push(RPC.ControlIWant.codec().decode(reader, reader.uint32()))
                if (obj.iwant.length < opts.maxControlMessages) {
                    obj.iwant.push(decodeControlIWant(reader, reader.uint32(), opts));
                }
                else
                    reader.skipType(tag & 7);
                break;
            case 3:
                // obj.graft.push(RPC.ControlGraft.codec().decode(reader, reader.uint32()))
                if (obj.graft.length < opts.maxControlMessages)
                    obj.graft.push(decodeControlGraft(reader, reader.uint32()));
                else
                    reader.skipType(tag & 7);
                break;
            case 4:
                // obj.prune.push(RPC.ControlPrune.codec().decode(reader, reader.uint32()))
                if (obj.prune.length < opts.maxControlMessages) {
                    obj.prune.push(decodeControlPrune(reader, reader.uint32(), opts));
                }
                else
                    reader.skipType(tag & 7);
                break;
            default:
                reader.skipType(tag & 7);
                break;
        }
    }
    return obj;
}
function decodeControlIHave(reader, length, opts) {
    const obj = {
        messageIDs: []
    };
    const end = length == null ? reader.len : reader.pos + length;
    while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
            case 1:
                obj.topicID = reader.string();
                break;
            case 2:
                // obj.messageIDs.push(reader.bytes())
                if (opts.maxIhaveMessageIDs-- > 0)
                    obj.messageIDs.push(reader.bytes());
                else
                    reader.skipType(tag & 7);
                break;
            default:
                console.log('@@@ decodeControlIhave tag >>> 3', tag >>> 3, 'tag', tag, length, 'length');
                reader.skipType(tag & 7);
                break;
        }
    }
    return obj;
}
function decodeControlIWant(reader, length, opts) {
    const obj = {
        messageIDs: []
    };
    const end = length == null ? reader.len : reader.pos + length;
    while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
            case 1:
                if (opts.maxIwantMessageIDs-- > 0)
                    obj.messageIDs.push(reader.bytes());
                else
                    reader.skipType(tag & 7);
                break;
            default:
                reader.skipType(tag & 7);
                break;
        }
    }
    return obj;
}
function decodeControlGraft(reader, length) {
    const obj = {};
    const end = length == null ? reader.len : reader.pos + length;
    while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
            case 1:
                obj.topicID = reader.string();
                break;
            default:
                reader.skipType(tag & 7);
                break;
        }
    }
    return obj;
}
function decodeControlPrune(reader, length, opts) {
    const obj = {
        peers: []
    };
    const end = length == null ? reader.len : reader.pos + length;
    while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
            case 1:
                obj.topicID = reader.string();
                break;
            case 2:
                if (opts.maxPeerInfos-- > 0)
                    obj.peers.push(decodePeerInfo(reader, reader.uint32()));
                else
                    reader.skipType(tag & 7);
                break;
            case 3:
                obj.backoff = reader.uint64();
                break;
            default:
                reader.skipType(tag & 7);
                break;
        }
    }
    return obj;
}
function decodePeerInfo(reader, length) {
    const obj = {};
    const end = length == null ? reader.len : reader.pos + length;
    while (reader.pos < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
            case 1:
                obj.peerID = reader.bytes();
                break;
            case 2:
                obj.signedPeerRecord = reader.bytes();
                break;
            default:
                reader.skipType(tag & 7);
                break;
        }
    }
    return obj;
}
//# sourceMappingURL=decodeRpc.js.map