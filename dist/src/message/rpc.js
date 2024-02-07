/* eslint-disable import/export */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-unnecessary-boolean-literal-compare */
/* eslint-disable @typescript-eslint/no-empty-interface */
import { decodeMessage, encodeMessage, message } from 'protons-runtime';
export var RPC;
(function (RPC) {
    let SubOpts;
    (function (SubOpts) {
        let _codec;
        SubOpts.codec = () => {
            if (_codec == null) {
                _codec = message((obj, w, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        w.fork();
                    }
                    if (obj.subscribe != null) {
                        w.uint32(8);
                        w.bool(obj.subscribe);
                    }
                    if (obj.topic != null) {
                        w.uint32(18);
                        w.string(obj.topic);
                    }
                    if (opts.lengthDelimited !== false) {
                        w.ldelim();
                    }
                }, (reader, length) => {
                    const obj = {};
                    const end = length == null ? reader.len : reader.pos + length;
                    while (reader.pos < end) {
                        const tag = reader.uint32();
                        switch (tag >>> 3) {
                            case 1: {
                                obj.subscribe = reader.bool();
                                break;
                            }
                            case 2: {
                                obj.topic = reader.string();
                                break;
                            }
                            default: {
                                reader.skipType(tag & 7);
                                break;
                            }
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
                _codec = message((obj, w, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        w.fork();
                    }
                    if (obj.from != null) {
                        w.uint32(10);
                        w.bytes(obj.from);
                    }
                    if (obj.data != null) {
                        w.uint32(18);
                        w.bytes(obj.data);
                    }
                    if (obj.seqno != null) {
                        w.uint32(26);
                        w.bytes(obj.seqno);
                    }
                    if ((obj.topic != null && obj.topic !== '')) {
                        w.uint32(34);
                        w.string(obj.topic);
                    }
                    if (obj.signature != null) {
                        w.uint32(42);
                        w.bytes(obj.signature);
                    }
                    if (obj.key != null) {
                        w.uint32(50);
                        w.bytes(obj.key);
                    }
                    if (opts.lengthDelimited !== false) {
                        w.ldelim();
                    }
                }, (reader, length) => {
                    const obj = {
                        topic: ''
                    };
                    const end = length == null ? reader.len : reader.pos + length;
                    while (reader.pos < end) {
                        const tag = reader.uint32();
                        switch (tag >>> 3) {
                            case 1: {
                                obj.from = reader.bytes();
                                break;
                            }
                            case 2: {
                                obj.data = reader.bytes();
                                break;
                            }
                            case 3: {
                                obj.seqno = reader.bytes();
                                break;
                            }
                            case 4: {
                                obj.topic = reader.string();
                                break;
                            }
                            case 5: {
                                obj.signature = reader.bytes();
                                break;
                            }
                            case 6: {
                                obj.key = reader.bytes();
                                break;
                            }
                            default: {
                                reader.skipType(tag & 7);
                                break;
                            }
                        }
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
                _codec = message((obj, w, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        w.fork();
                    }
                    if (obj.ihave != null) {
                        for (const value of obj.ihave) {
                            w.uint32(10);
                            RPC.ControlIHave.codec().encode(value, w);
                        }
                    }
                    if (obj.iwant != null) {
                        for (const value of obj.iwant) {
                            w.uint32(18);
                            RPC.ControlIWant.codec().encode(value, w);
                        }
                    }
                    if (obj.graft != null) {
                        for (const value of obj.graft) {
                            w.uint32(26);
                            RPC.ControlGraft.codec().encode(value, w);
                        }
                    }
                    if (obj.prune != null) {
                        for (const value of obj.prune) {
                            w.uint32(34);
                            RPC.ControlPrune.codec().encode(value, w);
                        }
                    }
                    if (opts.lengthDelimited !== false) {
                        w.ldelim();
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
                            case 1: {
                                obj.ihave.push(RPC.ControlIHave.codec().decode(reader, reader.uint32()));
                                break;
                            }
                            case 2: {
                                obj.iwant.push(RPC.ControlIWant.codec().decode(reader, reader.uint32()));
                                break;
                            }
                            case 3: {
                                obj.graft.push(RPC.ControlGraft.codec().decode(reader, reader.uint32()));
                                break;
                            }
                            case 4: {
                                obj.prune.push(RPC.ControlPrune.codec().decode(reader, reader.uint32()));
                                break;
                            }
                            default: {
                                reader.skipType(tag & 7);
                                break;
                            }
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
                _codec = message((obj, w, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        w.fork();
                    }
                    if (obj.topicID != null) {
                        w.uint32(10);
                        w.string(obj.topicID);
                    }
                    if (obj.messageIDs != null) {
                        for (const value of obj.messageIDs) {
                            w.uint32(18);
                            w.bytes(value);
                        }
                    }
                    if (opts.lengthDelimited !== false) {
                        w.ldelim();
                    }
                }, (reader, length) => {
                    const obj = {
                        messageIDs: []
                    };
                    const end = length == null ? reader.len : reader.pos + length;
                    while (reader.pos < end) {
                        const tag = reader.uint32();
                        switch (tag >>> 3) {
                            case 1: {
                                obj.topicID = reader.string();
                                break;
                            }
                            case 2: {
                                obj.messageIDs.push(reader.bytes());
                                break;
                            }
                            default: {
                                reader.skipType(tag & 7);
                                break;
                            }
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
                _codec = message((obj, w, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        w.fork();
                    }
                    if (obj.messageIDs != null) {
                        for (const value of obj.messageIDs) {
                            w.uint32(10);
                            w.bytes(value);
                        }
                    }
                    if (opts.lengthDelimited !== false) {
                        w.ldelim();
                    }
                }, (reader, length) => {
                    const obj = {
                        messageIDs: []
                    };
                    const end = length == null ? reader.len : reader.pos + length;
                    while (reader.pos < end) {
                        const tag = reader.uint32();
                        switch (tag >>> 3) {
                            case 1: {
                                obj.messageIDs.push(reader.bytes());
                                break;
                            }
                            default: {
                                reader.skipType(tag & 7);
                                break;
                            }
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
                _codec = message((obj, w, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        w.fork();
                    }
                    if (obj.topicID != null) {
                        w.uint32(10);
                        w.string(obj.topicID);
                    }
                    if (opts.lengthDelimited !== false) {
                        w.ldelim();
                    }
                }, (reader, length) => {
                    const obj = {};
                    const end = length == null ? reader.len : reader.pos + length;
                    while (reader.pos < end) {
                        const tag = reader.uint32();
                        switch (tag >>> 3) {
                            case 1: {
                                obj.topicID = reader.string();
                                break;
                            }
                            default: {
                                reader.skipType(tag & 7);
                                break;
                            }
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
                _codec = message((obj, w, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        w.fork();
                    }
                    if (obj.topicID != null) {
                        w.uint32(10);
                        w.string(obj.topicID);
                    }
                    if (obj.peers != null) {
                        for (const value of obj.peers) {
                            w.uint32(18);
                            RPC.PeerInfo.codec().encode(value, w);
                        }
                    }
                    if (obj.backoff != null) {
                        w.uint32(24);
                        w.uint64Number(obj.backoff);
                    }
                    if (opts.lengthDelimited !== false) {
                        w.ldelim();
                    }
                }, (reader, length) => {
                    const obj = {
                        peers: []
                    };
                    const end = length == null ? reader.len : reader.pos + length;
                    while (reader.pos < end) {
                        const tag = reader.uint32();
                        switch (tag >>> 3) {
                            case 1: {
                                obj.topicID = reader.string();
                                break;
                            }
                            case 2: {
                                obj.peers.push(RPC.PeerInfo.codec().decode(reader, reader.uint32()));
                                break;
                            }
                            case 3: {
                                obj.backoff = reader.uint64Number();
                                break;
                            }
                            default: {
                                reader.skipType(tag & 7);
                                break;
                            }
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
                _codec = message((obj, w, opts = {}) => {
                    if (opts.lengthDelimited !== false) {
                        w.fork();
                    }
                    if (obj.peerID != null) {
                        w.uint32(10);
                        w.bytes(obj.peerID);
                    }
                    if (obj.signedPeerRecord != null) {
                        w.uint32(18);
                        w.bytes(obj.signedPeerRecord);
                    }
                    if (opts.lengthDelimited !== false) {
                        w.ldelim();
                    }
                }, (reader, length) => {
                    const obj = {};
                    const end = length == null ? reader.len : reader.pos + length;
                    while (reader.pos < end) {
                        const tag = reader.uint32();
                        switch (tag >>> 3) {
                            case 1: {
                                obj.peerID = reader.bytes();
                                break;
                            }
                            case 2: {
                                obj.signedPeerRecord = reader.bytes();
                                break;
                            }
                            default: {
                                reader.skipType(tag & 7);
                                break;
                            }
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
            _codec = message((obj, w, opts = {}) => {
                if (opts.lengthDelimited !== false) {
                    w.fork();
                }
                if (obj.subscriptions != null) {
                    for (const value of obj.subscriptions) {
                        w.uint32(10);
                        RPC.SubOpts.codec().encode(value, w);
                    }
                }
                if (obj.messages != null) {
                    for (const value of obj.messages) {
                        w.uint32(18);
                        RPC.Message.codec().encode(value, w);
                    }
                }
                if (obj.control != null) {
                    w.uint32(26);
                    RPC.ControlMessage.codec().encode(obj.control, w);
                }
                if (opts.lengthDelimited !== false) {
                    w.ldelim();
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
                        case 1: {
                            obj.subscriptions.push(RPC.SubOpts.codec().decode(reader, reader.uint32()));
                            break;
                        }
                        case 2: {
                            obj.messages.push(RPC.Message.codec().decode(reader, reader.uint32()));
                            break;
                        }
                        case 3: {
                            obj.control = RPC.ControlMessage.codec().decode(reader, reader.uint32());
                            break;
                        }
                        default: {
                            reader.skipType(tag & 7);
                            break;
                        }
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