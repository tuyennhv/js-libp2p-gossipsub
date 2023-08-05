/* eslint-disable import/export */
/* eslint-disable @typescript-eslint/no-namespace */
import { encodeMessage, decodeMessage, message } from 'protons-runtime';
export var RPC;
(function (RPC) {
    let SubOpts;
    (function (SubOpts) {
        let _codec;
        SubOpts.codec = () => {
            if (_codec == null) {
                _codec = message((obj, writer, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        writer.fork();
                    }
                    if (obj.subscribe != null) {
                        writer.uint32(8);
                        writer.bool(obj.subscribe);
                    }
                    if (obj.topic != null) {
                        writer.uint32(18);
                        writer.string(obj.topic);
                    }
                    if (opts.lengthDelimited !== false) {
                        writer.ldelim();
                    }
                }, (reader, length) => {
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
                });
            }
            return _codec;
        };
        SubOpts.encode = (obj) => {
            return encodeMessage(obj, SubOpts.codec());
        };
        SubOpts.decode = (buf) => {
            return decodeMessage(buf, SubOpts.codec());
        };
    })(SubOpts = RPC.SubOpts || (RPC.SubOpts = {}));
    let Message;
    (function (Message) {
        let _codec;
        Message.codec = () => {
            if (_codec == null) {
                _codec = message((obj, writer, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        writer.fork();
                    }
                    if (obj.from != null) {
                        writer.uint32(10);
                        writer.bytes(obj.from);
                    }
                    if (obj.data != null) {
                        writer.uint32(18);
                        writer.bytes(obj.data);
                    }
                    if (obj.seqno != null) {
                        writer.uint32(26);
                        writer.bytes(obj.seqno);
                    }
                    if (obj.topic != null) {
                        writer.uint32(34);
                        writer.string(obj.topic);
                    }
                    else {
                        throw new Error('Protocol error: required field "topic" was not found in object');
                    }
                    if (obj.signature != null) {
                        writer.uint32(42);
                        writer.bytes(obj.signature);
                    }
                    if (obj.key != null) {
                        writer.uint32(50);
                        writer.bytes(obj.key);
                    }
                    if (opts.lengthDelimited !== false) {
                        writer.ldelim();
                    }
                }, (reader, length) => {
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
                });
            }
            return _codec;
        };
        Message.encode = (obj) => {
            return encodeMessage(obj, Message.codec());
        };
        Message.decode = (buf) => {
            return decodeMessage(buf, Message.codec());
        };
    })(Message = RPC.Message || (RPC.Message = {}));
    let ControlMessage;
    (function (ControlMessage) {
        let _codec;
        ControlMessage.codec = () => {
            if (_codec == null) {
                _codec = message((obj, writer, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        writer.fork();
                    }
                    if (obj.ihave != null) {
                        for (const value of obj.ihave) {
                            writer.uint32(10);
                            RPC.ControlIHave.codec().encode(value, writer);
                        }
                    }
                    else {
                        throw new Error('Protocol error: required field "ihave" was not found in object');
                    }
                    if (obj.iwant != null) {
                        for (const value of obj.iwant) {
                            writer.uint32(18);
                            RPC.ControlIWant.codec().encode(value, writer);
                        }
                    }
                    else {
                        throw new Error('Protocol error: required field "iwant" was not found in object');
                    }
                    if (obj.graft != null) {
                        for (const value of obj.graft) {
                            writer.uint32(26);
                            RPC.ControlGraft.codec().encode(value, writer);
                        }
                    }
                    else {
                        throw new Error('Protocol error: required field "graft" was not found in object');
                    }
                    if (obj.prune != null) {
                        for (const value of obj.prune) {
                            writer.uint32(34);
                            RPC.ControlPrune.codec().encode(value, writer);
                        }
                    }
                    else {
                        throw new Error('Protocol error: required field "prune" was not found in object');
                    }
                    if (opts.lengthDelimited !== false) {
                        writer.ldelim();
                    }
                }, (reader, length) => {
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
                                obj.ihave.push(RPC.ControlIHave.codec().decode(reader, reader.uint32()));
                                break;
                            case 2:
                                obj.iwant.push(RPC.ControlIWant.codec().decode(reader, reader.uint32()));
                                break;
                            case 3:
                                obj.graft.push(RPC.ControlGraft.codec().decode(reader, reader.uint32()));
                                break;
                            case 4:
                                obj.prune.push(RPC.ControlPrune.codec().decode(reader, reader.uint32()));
                                break;
                            default:
                                reader.skipType(tag & 7);
                                break;
                        }
                    }
                    return obj;
                });
            }
            return _codec;
        };
        ControlMessage.encode = (obj) => {
            return encodeMessage(obj, ControlMessage.codec());
        };
        ControlMessage.decode = (buf) => {
            return decodeMessage(buf, ControlMessage.codec());
        };
    })(ControlMessage = RPC.ControlMessage || (RPC.ControlMessage = {}));
    let ControlIHave;
    (function (ControlIHave) {
        let _codec;
        ControlIHave.codec = () => {
            if (_codec == null) {
                _codec = message((obj, writer, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        writer.fork();
                    }
                    if (obj.topicID != null) {
                        writer.uint32(10);
                        writer.string(obj.topicID);
                    }
                    if (obj.messageIDs != null) {
                        for (const value of obj.messageIDs) {
                            writer.uint32(18);
                            writer.bytes(value);
                        }
                    }
                    else {
                        throw new Error('Protocol error: required field "messageIDs" was not found in object');
                    }
                    if (opts.lengthDelimited !== false) {
                        writer.ldelim();
                    }
                }, (reader, length) => {
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
                                obj.messageIDs.push(reader.bytes());
                                break;
                            default:
                                reader.skipType(tag & 7);
                                break;
                        }
                    }
                    return obj;
                });
            }
            return _codec;
        };
        ControlIHave.encode = (obj) => {
            return encodeMessage(obj, ControlIHave.codec());
        };
        ControlIHave.decode = (buf) => {
            return decodeMessage(buf, ControlIHave.codec());
        };
    })(ControlIHave = RPC.ControlIHave || (RPC.ControlIHave = {}));
    let ControlIWant;
    (function (ControlIWant) {
        let _codec;
        ControlIWant.codec = () => {
            if (_codec == null) {
                _codec = message((obj, writer, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        writer.fork();
                    }
                    if (obj.messageIDs != null) {
                        for (const value of obj.messageIDs) {
                            writer.uint32(10);
                            writer.bytes(value);
                        }
                    }
                    else {
                        throw new Error('Protocol error: required field "messageIDs" was not found in object');
                    }
                    if (opts.lengthDelimited !== false) {
                        writer.ldelim();
                    }
                }, (reader, length) => {
                    const obj = {
                        messageIDs: []
                    };
                    const end = length == null ? reader.len : reader.pos + length;
                    while (reader.pos < end) {
                        const tag = reader.uint32();
                        switch (tag >>> 3) {
                            case 1:
                                obj.messageIDs.push(reader.bytes());
                                break;
                            default:
                                reader.skipType(tag & 7);
                                break;
                        }
                    }
                    return obj;
                });
            }
            return _codec;
        };
        ControlIWant.encode = (obj) => {
            return encodeMessage(obj, ControlIWant.codec());
        };
        ControlIWant.decode = (buf) => {
            return decodeMessage(buf, ControlIWant.codec());
        };
    })(ControlIWant = RPC.ControlIWant || (RPC.ControlIWant = {}));
    let ControlGraft;
    (function (ControlGraft) {
        let _codec;
        ControlGraft.codec = () => {
            if (_codec == null) {
                _codec = message((obj, writer, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        writer.fork();
                    }
                    if (obj.topicID != null) {
                        writer.uint32(10);
                        writer.string(obj.topicID);
                    }
                    if (opts.lengthDelimited !== false) {
                        writer.ldelim();
                    }
                }, (reader, length) => {
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
                });
            }
            return _codec;
        };
        ControlGraft.encode = (obj) => {
            return encodeMessage(obj, ControlGraft.codec());
        };
        ControlGraft.decode = (buf) => {
            return decodeMessage(buf, ControlGraft.codec());
        };
    })(ControlGraft = RPC.ControlGraft || (RPC.ControlGraft = {}));
    let ControlPrune;
    (function (ControlPrune) {
        let _codec;
        ControlPrune.codec = () => {
            if (_codec == null) {
                _codec = message((obj, writer, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        writer.fork();
                    }
                    if (obj.topicID != null) {
                        writer.uint32(10);
                        writer.string(obj.topicID);
                    }
                    if (obj.peers != null) {
                        for (const value of obj.peers) {
                            writer.uint32(18);
                            RPC.PeerInfo.codec().encode(value, writer);
                        }
                    }
                    else {
                        throw new Error('Protocol error: required field "peers" was not found in object');
                    }
                    if (obj.backoff != null) {
                        writer.uint32(24);
                        writer.uint64(obj.backoff);
                    }
                    if (opts.lengthDelimited !== false) {
                        writer.ldelim();
                    }
                }, (reader, length) => {
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
                                obj.peers.push(RPC.PeerInfo.codec().decode(reader, reader.uint32()));
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
                });
            }
            return _codec;
        };
        ControlPrune.encode = (obj) => {
            return encodeMessage(obj, ControlPrune.codec());
        };
        ControlPrune.decode = (buf) => {
            return decodeMessage(buf, ControlPrune.codec());
        };
    })(ControlPrune = RPC.ControlPrune || (RPC.ControlPrune = {}));
    let PeerInfo;
    (function (PeerInfo) {
        let _codec;
        PeerInfo.codec = () => {
            if (_codec == null) {
                _codec = message((obj, writer, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        writer.fork();
                    }
                    if (obj.peerID != null) {
                        writer.uint32(10);
                        writer.bytes(obj.peerID);
                    }
                    if (obj.signedPeerRecord != null) {
                        writer.uint32(18);
                        writer.bytes(obj.signedPeerRecord);
                    }
                    if (opts.lengthDelimited !== false) {
                        writer.ldelim();
                    }
                }, (reader, length) => {
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
                });
            }
            return _codec;
        };
        PeerInfo.encode = (obj) => {
            return encodeMessage(obj, PeerInfo.codec());
        };
        PeerInfo.decode = (buf) => {
            return decodeMessage(buf, PeerInfo.codec());
        };
    })(PeerInfo = RPC.PeerInfo || (RPC.PeerInfo = {}));
    let _codec;
    RPC.codec = () => {
        if (_codec == null) {
            _codec = message((obj, writer, opts = {}) => {
                if (opts.lengthDelimited !== false) {
                    writer.fork();
                }
                if (obj.subscriptions != null) {
                    for (const value of obj.subscriptions) {
                        writer.uint32(10);
                        RPC.SubOpts.codec().encode(value, writer);
                    }
                }
                else {
                    throw new Error('Protocol error: required field "subscriptions" was not found in object');
                }
                if (obj.messages != null) {
                    for (const value of obj.messages) {
                        writer.uint32(18);
                        RPC.Message.codec().encode(value, writer);
                    }
                }
                else {
                    throw new Error('Protocol error: required field "messages" was not found in object');
                }
                if (obj.control != null) {
                    writer.uint32(26);
                    RPC.ControlMessage.codec().encode(obj.control, writer);
                }
                if (opts.lengthDelimited !== false) {
                    writer.ldelim();
                }
            }, (reader, length) => {
                const obj = {
                    subscriptions: [],
                    messages: []
                };
                const end = length == null ? reader.len : reader.pos + length;
                while (reader.pos < end) {
                    const tag = reader.uint32();
                    switch (tag >>> 3) {
                        case 1:
                            obj.subscriptions.push(RPC.SubOpts.codec().decode(reader, reader.uint32()));
                            break;
                        case 2:
                            obj.messages.push(RPC.Message.codec().decode(reader, reader.uint32()));
                            break;
                        case 3:
                            obj.control = RPC.ControlMessage.codec().decode(reader, reader.uint32());
                            break;
                        default:
                            reader.skipType(tag & 7);
                            break;
                    }
                }
                return obj;
            });
        }
        return _codec;
    };
    RPC.encode = (obj) => {
        return encodeMessage(obj, RPC.codec());
    };
    RPC.decode = (buf) => {
        return decodeMessage(buf, RPC.codec());
    };
})(RPC || (RPC = {}));
//# sourceMappingURL=rpc.js.map