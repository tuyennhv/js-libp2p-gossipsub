import { CustomEvent, TypedEventEmitter } from '@libp2p/interface/events';
import { StrictSign, StrictNoSign, TopicValidatorResult } from '@libp2p/interface/pubsub';
import { logger } from '@libp2p/logger';
import { peerIdFromBytes, peerIdFromString } from '@libp2p/peer-id';
import { encode } from 'it-length-prefixed';
import { pipe } from 'it-pipe';
import { pushable } from 'it-pushable';
import * as constants from './constants.js';
import { ACCEPT_FROM_WHITELIST_DURATION_MS, ACCEPT_FROM_WHITELIST_MAX_MESSAGES, ACCEPT_FROM_WHITELIST_THRESHOLD_SCORE, BACKOFF_SLACK } from './constants.js';
import { decodeRpc, defaultDecodeRpcLimits } from './message/decodeRpc.js';
import { RPC } from './message/rpc.js';
import { MessageCache } from './message-cache.js';
import { ChurnReason, getMetrics, IHaveIgnoreReason, InclusionReason, ScorePenalty } from './metrics.js';
import { PeerScore, createPeerScoreParams, createPeerScoreThresholds } from './score/index.js';
import { computeAllPeersScoreWeights } from './score/scoreMetrics.js';
import { InboundStream, OutboundStream } from './stream.js';
import { IWantTracer } from './tracer.js';
import { ValidateError, MessageStatus, RejectReason, rejectReasonFromAcceptance } from './types.js';
import { buildRawMessage, validateToRawMessage } from './utils/buildRawMessage.js';
import { shuffle, messageIdToString } from './utils/index.js';
import { msgIdFnStrictNoSign, msgIdFnStrictSign } from './utils/msgIdFn.js';
import { multiaddrToIPStr } from './utils/multiaddr.js';
import { getPublishConfigFromPeerId } from './utils/publishConfig.js';
import { removeFirstNItemsFromSet, removeItemsFromSet } from './utils/set.js';
import { SimpleTimeCache } from './utils/time-cache.js';
export const multicodec = constants.GossipsubIDv11;
var GossipStatusCode;
(function (GossipStatusCode) {
    GossipStatusCode[GossipStatusCode["started"] = 0] = "started";
    GossipStatusCode[GossipStatusCode["stopped"] = 1] = "stopped";
})(GossipStatusCode || (GossipStatusCode = {}));
export class GossipSub extends TypedEventEmitter {
    /**
     * The signature policy to follow by default
     */
    globalSignaturePolicy;
    multicodecs = [constants.GossipsubIDv11, constants.GossipsubIDv10];
    publishConfig;
    dataTransform;
    // State
    peers = new Set();
    streamsInbound = new Map();
    streamsOutbound = new Map();
    /** Ensures outbound streams are created sequentially */
    outboundInflightQueue = pushable({ objectMode: true });
    /** Direct peers */
    direct = new Set();
    /** Floodsub peers */
    floodsubPeers = new Set();
    /** Cache of seen messages */
    seenCache;
    /**
     * Map of peer id and AcceptRequestWhileListEntry
     */
    acceptFromWhitelist = new Map();
    /**
     * Map of topics to which peers are subscribed to
     */
    topics = new Map();
    /**
     * List of our subscriptions
     */
    subscriptions = new Set();
    /**
     * Map of topic meshes
     * topic => peer id set
     */
    mesh = new Map();
    /**
     * Map of topics to set of peers. These mesh peers are the ones to which we are publishing without a topic membership
     * topic => peer id set
     */
    fanout = new Map();
    /**
     * Map of last publish time for fanout topics
     * topic => last publish time
     */
    fanoutLastpub = new Map();
    /**
     * Map of pending messages to gossip
     * peer id => control messages
     */
    gossip = new Map();
    /**
     * Map of control messages
     * peer id => control message
     */
    control = new Map();
    /**
     * Number of IHAVEs received from peer in the last heartbeat
     */
    peerhave = new Map();
    /** Number of messages we have asked from peer in the last heartbeat */
    iasked = new Map();
    /** Prune backoff map */
    backoff = new Map();
    /**
     * Connection direction cache, marks peers with outbound connections
     * peer id => direction
     */
    outbound = new Map();
    msgIdFn;
    /**
     * A fast message id function used for internal message de-duplication
     */
    fastMsgIdFn;
    msgIdToStrFn;
    /** Maps fast message-id to canonical message-id */
    fastMsgIdCache;
    /**
     * Short term cache for published message ids. This is used for penalizing peers sending
     * our own messages back if the messages are anonymous or use a random author.
     */
    publishedMessageIds;
    /**
     * A message cache that contains the messages for last few heartbeat ticks
     */
    mcache;
    /** Peer score tracking */
    score;
    /**
     * Custom validator function per topic.
     * Must return or resolve quickly (< 100ms) to prevent causing penalties for late messages.
     * If you need to apply validation that may require longer times use `asyncValidation` option and callback the
     * validation result through `Gossipsub.reportValidationResult`
     */
    topicValidators = new Map();
    /**
     * Make this protected so child class may want to redirect to its own log.
     */
    log;
    /**
     * Number of heartbeats since the beginning of time
     * This allows us to amortize some resource cleanup -- eg: backoff cleanup
     */
    heartbeatTicks = 0;
    /**
     * Tracks IHAVE/IWANT promises broken by peers
     */
    gossipTracer;
    components;
    directPeerInitial = null;
    static multicodec = constants.GossipsubIDv11;
    // Options
    opts;
    decodeRpcLimits;
    metrics;
    status = { code: GossipStatusCode.stopped };
    maxInboundStreams;
    maxOutboundStreams;
    allowedTopics;
    heartbeatTimer = null;
    constructor(components, options = {}) {
        super();
        const opts = {
            fallbackToFloodsub: true,
            floodPublish: true,
            batchPublish: false,
            doPX: false,
            directPeers: [],
            D: constants.GossipsubD,
            Dlo: constants.GossipsubDlo,
            Dhi: constants.GossipsubDhi,
            Dscore: constants.GossipsubDscore,
            Dout: constants.GossipsubDout,
            Dlazy: constants.GossipsubDlazy,
            heartbeatInterval: constants.GossipsubHeartbeatInterval,
            fanoutTTL: constants.GossipsubFanoutTTL,
            mcacheLength: constants.GossipsubHistoryLength,
            mcacheGossip: constants.GossipsubHistoryGossip,
            seenTTL: constants.GossipsubSeenTTL,
            gossipsubIWantFollowupMs: constants.GossipsubIWantFollowupTime,
            prunePeers: constants.GossipsubPrunePeers,
            pruneBackoff: constants.GossipsubPruneBackoff,
            unsubcribeBackoff: constants.GossipsubUnsubscribeBackoff,
            graftFloodThreshold: constants.GossipsubGraftFloodThreshold,
            opportunisticGraftPeers: constants.GossipsubOpportunisticGraftPeers,
            opportunisticGraftTicks: constants.GossipsubOpportunisticGraftTicks,
            directConnectTicks: constants.GossipsubDirectConnectTicks,
            ...options,
            scoreParams: createPeerScoreParams(options.scoreParams),
            scoreThresholds: createPeerScoreThresholds(options.scoreThresholds)
        };
        this.components = components;
        this.decodeRpcLimits = opts.decodeRpcLimits ?? defaultDecodeRpcLimits;
        this.globalSignaturePolicy = opts.globalSignaturePolicy ?? StrictSign;
        // Also wants to get notified of peers connected using floodsub
        if (opts.fallbackToFloodsub) {
            this.multicodecs.push(constants.FloodsubID);
        }
        // From pubsub
        this.log = logger(opts.debugName ?? 'libp2p:gossipsub');
        // Gossipsub
        this.opts = opts;
        this.direct = new Set(opts.directPeers.map((p) => p.id.toString()));
        this.seenCache = new SimpleTimeCache({ validityMs: opts.seenTTL });
        this.publishedMessageIds = new SimpleTimeCache({ validityMs: opts.seenTTL });
        if (options.msgIdFn != null) {
            // Use custom function
            this.msgIdFn = options.msgIdFn;
        }
        else {
            switch (this.globalSignaturePolicy) {
                case StrictSign:
                    this.msgIdFn = msgIdFnStrictSign;
                    break;
                case StrictNoSign:
                    this.msgIdFn = msgIdFnStrictNoSign;
                    break;
                default:
                    throw new Error(`Invalid globalSignaturePolicy: ${this.globalSignaturePolicy}`);
            }
        }
        if (options.fastMsgIdFn != null) {
            this.fastMsgIdFn = options.fastMsgIdFn;
            this.fastMsgIdCache = new SimpleTimeCache({ validityMs: opts.seenTTL });
        }
        // By default, gossipsub only provide a browser friendly function to convert Uint8Array message id to string.
        this.msgIdToStrFn = options.msgIdToStrFn ?? messageIdToString;
        this.mcache = options.messageCache ?? new MessageCache(opts.mcacheGossip, opts.mcacheLength, this.msgIdToStrFn);
        if (options.dataTransform != null) {
            this.dataTransform = options.dataTransform;
        }
        if (options.metricsRegister != null) {
            if (options.metricsTopicStrToLabel == null) {
                throw Error('Must set metricsTopicStrToLabel with metrics');
            }
            // in theory, each topic has its own meshMessageDeliveriesWindow param
            // however in lodestar, we configure it mostly the same so just pick the max of positive ones
            // (some topics have meshMessageDeliveriesWindow as 0)
            const maxMeshMessageDeliveriesWindowMs = Math.max(...Object.values(opts.scoreParams.topics).map((topicParam) => topicParam.meshMessageDeliveriesWindow), constants.DEFAULT_METRIC_MESH_MESSAGE_DELIVERIES_WINDOWS);
            const metrics = getMetrics(options.metricsRegister, options.metricsTopicStrToLabel, {
                gossipPromiseExpireSec: this.opts.gossipsubIWantFollowupMs / 1000,
                behaviourPenaltyThreshold: opts.scoreParams.behaviourPenaltyThreshold,
                maxMeshMessageDeliveriesWindowSec: maxMeshMessageDeliveriesWindowMs / 1000
            });
            metrics.mcacheSize.addCollect(() => { this.onScrapeMetrics(metrics); });
            for (const protocol of this.multicodecs) {
                metrics.protocolsEnabled.set({ protocol }, 1);
            }
            this.metrics = metrics;
        }
        else {
            this.metrics = null;
        }
        this.gossipTracer = new IWantTracer(this.opts.gossipsubIWantFollowupMs, this.msgIdToStrFn, this.metrics);
        /**
         * libp2p
         */
        this.score = new PeerScore(this.opts.scoreParams, this.metrics, {
            scoreCacheValidityMs: opts.heartbeatInterval
        });
        this.maxInboundStreams = options.maxInboundStreams;
        this.maxOutboundStreams = options.maxOutboundStreams;
        this.allowedTopics = (opts.allowedTopics != null) ? new Set(opts.allowedTopics) : null;
    }
    getPeers() {
        return [...this.peers.keys()].map((str) => peerIdFromString(str));
    }
    isStarted() {
        return this.status.code === GossipStatusCode.started;
    }
    // LIFECYCLE METHODS
    /**
     * Mounts the gossipsub protocol onto the libp2p node and sends our
     * our subscriptions to every peer connected
     */
    async start() {
        // From pubsub
        if (this.isStarted()) {
            return;
        }
        this.log('starting');
        this.publishConfig = await getPublishConfigFromPeerId(this.globalSignaturePolicy, this.components.peerId);
        // Create the outbound inflight queue
        // This ensures that outbound stream creation happens sequentially
        this.outboundInflightQueue = pushable({ objectMode: true });
        pipe(this.outboundInflightQueue, async (source) => {
            for await (const { peerId, connection } of source) {
                await this.createOutboundStream(peerId, connection);
            }
        }).catch((e) => { this.log.error('outbound inflight queue error', e); });
        // set direct peer addresses in the address book
        await Promise.all(this.opts.directPeers.map(async (p) => {
            await this.components.peerStore.merge(p.id, {
                multiaddrs: p.addrs
            });
        }));
        const registrar = this.components.registrar;
        // Incoming streams
        // Called after a peer dials us
        await Promise.all(this.multicodecs.map(async (multicodec) => registrar.handle(multicodec, this.onIncomingStream.bind(this), {
            maxInboundStreams: this.maxInboundStreams,
            maxOutboundStreams: this.maxOutboundStreams
        })));
        // # How does Gossipsub interact with libp2p? Rough guide from Mar 2022
        //
        // ## Setup:
        // Gossipsub requests libp2p to callback, TBD
        //
        // `this.libp2p.handle()` registers a handler for `/meshsub/1.1.0` and other Gossipsub protocols
        // The handler callback is registered in libp2p Upgrader.protocols map.
        //
        // Upgrader receives an inbound connection from some transport and (`Upgrader.upgradeInbound`):
        // - Adds encryption (NOISE in our case)
        // - Multiplex stream
        // - Create a muxer and register that for each new stream call Upgrader.protocols handler
        //
        // ## Topology
        // - new instance of Topology (unlinked to libp2p) with handlers
        // - registar.register(topology)
        // register protocol with topology
        // Topology callbacks called on connection manager changes
        const topology = {
            onConnect: this.onPeerConnected.bind(this),
            onDisconnect: this.onPeerDisconnected.bind(this)
        };
        const registrarTopologyIds = await Promise.all(this.multicodecs.map(async (multicodec) => registrar.register(multicodec, topology)));
        // Schedule to start heartbeat after `GossipsubHeartbeatInitialDelay`
        const heartbeatTimeout = setTimeout(this.runHeartbeat, constants.GossipsubHeartbeatInitialDelay);
        // Then, run heartbeat every `heartbeatInterval` offset by `GossipsubHeartbeatInitialDelay`
        this.status = {
            code: GossipStatusCode.started,
            registrarTopologyIds,
            heartbeatTimeout,
            hearbeatStartMs: Date.now() + constants.GossipsubHeartbeatInitialDelay
        };
        this.score.start();
        // connect to direct peers
        this.directPeerInitial = setTimeout(() => {
            Promise.resolve()
                .then(async () => {
                await Promise.all(Array.from(this.direct).map(async (id) => this.connect(id)));
            })
                .catch((err) => {
                this.log(err);
            });
        }, constants.GossipsubDirectConnectInitialDelay);
        this.log('started');
    }
    /**
     * Unmounts the gossipsub protocol and shuts down every connection
     */
    async stop() {
        this.log('stopping');
        // From pubsub
        if (this.status.code !== GossipStatusCode.started) {
            return;
        }
        const { registrarTopologyIds } = this.status;
        this.status = { code: GossipStatusCode.stopped };
        // unregister protocol and handlers
        const registrar = this.components.registrar;
        await Promise.all(this.multicodecs.map(async (multicodec) => registrar.unhandle(multicodec)));
        registrarTopologyIds.forEach((id) => { registrar.unregister(id); });
        this.outboundInflightQueue.end();
        const closePromises = [];
        for (const outboundStream of this.streamsOutbound.values()) {
            closePromises.push(outboundStream.close());
        }
        this.streamsOutbound.clear();
        for (const inboundStream of this.streamsInbound.values()) {
            closePromises.push(inboundStream.close());
        }
        this.streamsInbound.clear();
        await Promise.all(closePromises);
        this.peers.clear();
        this.subscriptions.clear();
        // Gossipsub
        if (this.heartbeatTimer != null) {
            this.heartbeatTimer.cancel();
            this.heartbeatTimer = null;
        }
        this.score.stop();
        this.mesh.clear();
        this.fanout.clear();
        this.fanoutLastpub.clear();
        this.gossip.clear();
        this.control.clear();
        this.peerhave.clear();
        this.iasked.clear();
        this.backoff.clear();
        this.outbound.clear();
        this.gossipTracer.clear();
        this.seenCache.clear();
        if (this.fastMsgIdCache != null)
            this.fastMsgIdCache.clear();
        if (this.directPeerInitial != null)
            clearTimeout(this.directPeerInitial);
        this.log('stopped');
    }
    /** FOR DEBUG ONLY - Dump peer stats for all peers. Data is cloned, safe to mutate */
    dumpPeerScoreStats() {
        return this.score.dumpPeerScoreStats();
    }
    /**
     * On an inbound stream opened
     */
    onIncomingStream({ stream, connection }) {
        if (!this.isStarted()) {
            return;
        }
        const peerId = connection.remotePeer;
        // add peer to router
        this.addPeer(peerId, connection.direction, connection.remoteAddr);
        // create inbound stream
        this.createInboundStream(peerId, stream);
        // attempt to create outbound stream
        this.outboundInflightQueue.push({ peerId, connection });
    }
    /**
     * Registrar notifies an established connection with pubsub protocol
     */
    onPeerConnected(peerId, connection) {
        this.metrics?.newConnectionCount.inc({ status: connection.status });
        // libp2p may emit a closed connection and never issue peer:disconnect event
        // see https://github.com/ChainSafe/js-libp2p-gossipsub/issues/398
        if (!this.isStarted() || connection.status !== 'open') {
            return;
        }
        this.addPeer(peerId, connection.direction, connection.remoteAddr);
        this.outboundInflightQueue.push({ peerId, connection });
    }
    /**
     * Registrar notifies a closing connection with pubsub protocol
     */
    onPeerDisconnected(peerId) {
        this.log('connection ended %p', peerId);
        this.removePeer(peerId);
    }
    async createOutboundStream(peerId, connection) {
        if (!this.isStarted()) {
            return;
        }
        const id = peerId.toString();
        if (!this.peers.has(id)) {
            return;
        }
        // TODO make this behavior more robust
        // This behavior is different than for inbound streams
        // If an outbound stream already exists, don't create a new stream
        if (this.streamsOutbound.has(id)) {
            return;
        }
        try {
            const stream = new OutboundStream(await connection.newStream(this.multicodecs), (e) => { this.log.error('outbound pipe error', e); }, { maxBufferSize: this.opts.maxOutboundBufferSize });
            this.log('create outbound stream %p', peerId);
            this.streamsOutbound.set(id, stream);
            const protocol = stream.protocol;
            if (protocol === constants.FloodsubID) {
                this.floodsubPeers.add(id);
            }
            this.metrics?.peersPerProtocol.inc({ protocol }, 1);
            // Immediately send own subscriptions via the newly attached stream
            if (this.subscriptions.size > 0) {
                this.log('send subscriptions to', id);
                this.sendSubscriptions(id, Array.from(this.subscriptions), true);
            }
        }
        catch (e) {
            this.log.error('createOutboundStream error', e);
        }
    }
    createInboundStream(peerId, stream) {
        if (!this.isStarted()) {
            return;
        }
        const id = peerId.toString();
        if (!this.peers.has(id)) {
            return;
        }
        // TODO make this behavior more robust
        // This behavior is different than for outbound streams
        // If a peer initiates a new inbound connection
        // we assume that one is the new canonical inbound stream
        const priorInboundStream = this.streamsInbound.get(id);
        if (priorInboundStream !== undefined) {
            this.log('replacing existing inbound steam %s', id);
            priorInboundStream.close().catch((err) => { this.log.error(err); });
        }
        this.log('create inbound stream %s', id);
        const inboundStream = new InboundStream(stream, { maxDataLength: this.opts.maxInboundDataLength });
        this.streamsInbound.set(id, inboundStream);
        this.pipePeerReadStream(peerId, inboundStream.source).catch((err) => { this.log(err); });
    }
    /**
     * Add a peer to the router
     */
    addPeer(peerId, direction, addr) {
        const id = peerId.toString();
        if (!this.peers.has(id)) {
            this.log('new peer %p', peerId);
            this.peers.add(id);
            // Add to peer scoring
            this.score.addPeer(id);
            const currentIP = multiaddrToIPStr(addr);
            if (currentIP !== null) {
                this.score.addIP(id, currentIP);
            }
            else {
                this.log('Added peer has no IP in current address %s %s', id, addr.toString());
            }
            // track the connection direction. Don't allow to unset outbound
            if (!this.outbound.has(id)) {
                this.outbound.set(id, direction === 'outbound');
            }
        }
    }
    /**
     * Removes a peer from the router
     */
    removePeer(peerId) {
        const id = peerId.toString();
        if (!this.peers.has(id)) {
            return;
        }
        // delete peer
        this.log('delete peer %p', peerId);
        this.peers.delete(id);
        const outboundStream = this.streamsOutbound.get(id);
        const inboundStream = this.streamsInbound.get(id);
        if (outboundStream != null) {
            this.metrics?.peersPerProtocol.inc({ protocol: outboundStream.protocol }, -1);
        }
        // close streams
        outboundStream?.close().catch((err) => { this.log.error(err); });
        inboundStream?.close().catch((err) => { this.log.error(err); });
        // remove streams
        this.streamsOutbound.delete(id);
        this.streamsInbound.delete(id);
        // remove peer from topics map
        for (const peers of this.topics.values()) {
            peers.delete(id);
        }
        // Remove this peer from the mesh
        for (const [topicStr, peers] of this.mesh) {
            if (peers.delete(id)) {
                this.metrics?.onRemoveFromMesh(topicStr, ChurnReason.Dc, 1);
            }
        }
        // Remove this peer from the fanout
        for (const peers of this.fanout.values()) {
            peers.delete(id);
        }
        // Remove from floodsubPeers
        this.floodsubPeers.delete(id);
        // Remove from gossip mapping
        this.gossip.delete(id);
        // Remove from control mapping
        this.control.delete(id);
        // Remove from backoff mapping
        this.outbound.delete(id);
        // Remove from peer scoring
        this.score.removePeer(id);
        this.acceptFromWhitelist.delete(id);
    }
    // API METHODS
    get started() {
        return this.status.code === GossipStatusCode.started;
    }
    /**
     * Get a the peer-ids in a topic mesh
     */
    getMeshPeers(topic) {
        const peersInTopic = this.mesh.get(topic);
        return (peersInTopic != null) ? Array.from(peersInTopic) : [];
    }
    /**
     * Get a list of the peer-ids that are subscribed to one topic.
     */
    getSubscribers(topic) {
        const peersInTopic = this.topics.get(topic);
        return ((peersInTopic != null) ? Array.from(peersInTopic) : []).map((str) => peerIdFromString(str));
    }
    /**
     * Get the list of topics which the peer is subscribed to.
     */
    getTopics() {
        return Array.from(this.subscriptions);
    }
    // TODO: Reviewing Pubsub API
    // MESSAGE METHODS
    /**
     * Responsible for processing each RPC message received by other peers.
     */
    async pipePeerReadStream(peerId, stream) {
        try {
            await pipe(stream, async (source) => {
                for await (const data of source) {
                    try {
                        // TODO: Check max gossip message size, before decodeRpc()
                        const rpcBytes = data.subarray();
                        // Note: This function may throw, it must be wrapped in a try {} catch {} to prevent closing the stream.
                        // TODO: What should we do if the entire RPC is invalid?
                        const rpc = decodeRpc(rpcBytes, this.decodeRpcLimits);
                        this.metrics?.onRpcRecv(rpc, rpcBytes.length);
                        // Since processRpc may be overridden entirely in unsafe ways,
                        // the simplest/safest option here is to wrap in a function and capture all errors
                        // to prevent a top-level unhandled exception
                        // This processing of rpc messages should happen without awaiting full validation/execution of prior messages
                        if (this.opts.awaitRpcHandler) {
                            try {
                                await this.handleReceivedRpc(peerId, rpc);
                            }
                            catch (err) {
                                this.metrics?.onRpcRecvError();
                                this.log(err);
                            }
                        }
                        else {
                            this.handleReceivedRpc(peerId, rpc).catch((err) => {
                                this.metrics?.onRpcRecvError();
                                this.log(err);
                            });
                        }
                    }
                    catch (e) {
                        this.metrics?.onRpcDataError();
                        this.log(e);
                    }
                }
            });
        }
        catch (err) {
            this.metrics?.onPeerReadStreamError();
            this.handlePeerReadStreamError(err, peerId);
        }
    }
    /**
     * Handle error when read stream pipe throws, less of the functional use but more
     * to for testing purposes to spy on the error handling
     * */
    handlePeerReadStreamError(err, peerId) {
        this.log.error(err);
        this.onPeerDisconnected(peerId);
    }
    /**
     * Handles an rpc request from a peer
     */
    async handleReceivedRpc(from, rpc) {
        // Check if peer is graylisted in which case we ignore the event
        if (!this.acceptFrom(from.toString())) {
            this.log('received message from unacceptable peer %p', from);
            this.metrics?.rpcRecvNotAccepted.inc();
            return;
        }
        const subscriptions = (rpc.subscriptions != null) ? rpc.subscriptions.length : 0;
        const messages = (rpc.messages != null) ? rpc.messages.length : 0;
        let ihave = 0;
        let iwant = 0;
        let graft = 0;
        let prune = 0;
        if (rpc.control != null) {
            if (rpc.control.ihave != null)
                ihave = rpc.control.ihave.length;
            if (rpc.control.iwant != null)
                iwant = rpc.control.iwant.length;
            if (rpc.control.graft != null)
                graft = rpc.control.graft.length;
            if (rpc.control.prune != null)
                prune = rpc.control.prune.length;
        }
        this.log(`rpc.from ${from.toString()} subscriptions ${subscriptions} messages ${messages} ihave ${ihave} iwant ${iwant} graft ${graft} prune ${prune}`);
        // Handle received subscriptions
        if ((rpc.subscriptions != null) && rpc.subscriptions.length > 0) {
            // update peer subscriptions
            const subscriptions = [];
            rpc.subscriptions.forEach((subOpt) => {
                const topic = subOpt.topic;
                const subscribe = subOpt.subscribe === true;
                if (topic != null) {
                    if ((this.allowedTopics != null) && !this.allowedTopics.has(topic)) {
                        // Not allowed: subscription data-structures are not bounded by topic count
                        // TODO: Should apply behaviour penalties?
                        return;
                    }
                    this.handleReceivedSubscription(from, topic, subscribe);
                    subscriptions.push({ topic, subscribe });
                }
            });
            this.safeDispatchEvent('subscription-change', {
                detail: { peerId: from, subscriptions }
            });
        }
        // Handle messages
        // TODO: (up to limit)
        if (rpc.messages != null) {
            for (const message of rpc.messages) {
                if ((this.allowedTopics != null) && !this.allowedTopics.has(message.topic)) {
                    // Not allowed: message cache data-structures are not bounded by topic count
                    // TODO: Should apply behaviour penalties?
                    continue;
                }
                const handleReceivedMessagePromise = this.handleReceivedMessage(from, message)
                    // Should never throw, but handle just in case
                    .catch((err) => {
                    this.metrics?.onMsgRecvError(message.topic);
                    this.log(err);
                });
                if (this.opts.awaitRpcMessageHandler) {
                    await handleReceivedMessagePromise;
                }
            }
        }
        // Handle control messages
        if (rpc.control != null) {
            await this.handleControlMessage(from.toString(), rpc.control);
        }
    }
    /**
     * Handles a subscription change from a peer
     */
    handleReceivedSubscription(from, topic, subscribe) {
        this.log('subscription update from %p topic %s', from, topic);
        let topicSet = this.topics.get(topic);
        if (topicSet == null) {
            topicSet = new Set();
            this.topics.set(topic, topicSet);
        }
        if (subscribe) {
            // subscribe peer to new topic
            topicSet.add(from.toString());
        }
        else {
            // unsubscribe from existing topic
            topicSet.delete(from.toString());
        }
        // TODO: rust-libp2p has A LOT more logic here
    }
    /**
     * Handles a newly received message from an RPC.
     * May forward to all peers in the mesh.
     */
    async handleReceivedMessage(from, rpcMsg) {
        this.metrics?.onMsgRecvPreValidation(rpcMsg.topic);
        const validationResult = await this.validateReceivedMessage(from, rpcMsg);
        this.metrics?.onPrevalidationResult(rpcMsg.topic, validationResult.code);
        const validationCode = validationResult.code;
        switch (validationCode) {
            case MessageStatus.duplicate:
                // Report the duplicate
                this.score.duplicateMessage(from.toString(), validationResult.msgIdStr, rpcMsg.topic);
                // due to the collision of fastMsgIdFn, 2 different messages may end up the same fastMsgId
                // so we need to also mark the duplicate message as delivered or the promise is not resolved
                // and peer gets penalized. See https://github.com/ChainSafe/js-libp2p-gossipsub/pull/385
                this.gossipTracer.deliverMessage(validationResult.msgIdStr, true);
                this.mcache.observeDuplicate(validationResult.msgIdStr, from.toString());
                return;
            case MessageStatus.invalid:
                // invalid messages received
                // metrics.register_invalid_message(&raw_message.topic)
                // Tell peer_score about reject
                // Reject the original source, and any duplicates we've seen from other peers.
                if (validationResult.msgIdStr != null) {
                    const msgIdStr = validationResult.msgIdStr;
                    this.score.rejectMessage(from.toString(), msgIdStr, rpcMsg.topic, validationResult.reason);
                    this.gossipTracer.rejectMessage(msgIdStr, validationResult.reason);
                }
                else {
                    this.score.rejectInvalidMessage(from.toString(), rpcMsg.topic);
                }
                this.metrics?.onMsgRecvInvalid(rpcMsg.topic, validationResult);
                return;
            case MessageStatus.valid:
                // Tells score that message arrived (but is maybe not fully validated yet).
                // Consider the message as delivered for gossip promises.
                this.score.validateMessage(validationResult.messageId.msgIdStr);
                this.gossipTracer.deliverMessage(validationResult.messageId.msgIdStr);
                // Add the message to our memcache
                // if no validation is required, mark the message as validated
                this.mcache.put(validationResult.messageId, rpcMsg, !this.opts.asyncValidation);
                // Dispatch the message to the user if we are subscribed to the topic
                if (this.subscriptions.has(rpcMsg.topic)) {
                    const isFromSelf = this.components.peerId.equals(from);
                    if (!isFromSelf || this.opts.emitSelf) {
                        super.dispatchEvent(new CustomEvent('gossipsub:message', {
                            detail: {
                                propagationSource: from,
                                msgId: validationResult.messageId.msgIdStr,
                                msg: validationResult.msg
                            }
                        }));
                        // TODO: Add option to switch between emit per topic or all messages in one
                        super.dispatchEvent(new CustomEvent('message', { detail: validationResult.msg }));
                    }
                }
                // Forward the message to mesh peers, if no validation is required
                // If asyncValidation is ON, expect the app layer to call reportMessageValidationResult(), then forward
                if (!this.opts.asyncValidation) {
                    // TODO: in rust-libp2p
                    // .forward_msg(&msg_id, raw_message, Some(propagation_source))
                    this.forwardMessage(validationResult.messageId.msgIdStr, rpcMsg, from.toString());
                }
                break;
            default:
                throw new Error(`Invalid validation result: ${validationCode}`);
        }
    }
    /**
     * Handles a newly received message from an RPC.
     * May forward to all peers in the mesh.
     */
    async validateReceivedMessage(propagationSource, rpcMsg) {
        // Fast message ID stuff
        const fastMsgIdStr = this.fastMsgIdFn?.(rpcMsg);
        const msgIdCached = fastMsgIdStr !== undefined ? this.fastMsgIdCache?.get(fastMsgIdStr) : undefined;
        if (msgIdCached != null) {
            // This message has been seen previously. Ignore it
            return { code: MessageStatus.duplicate, msgIdStr: msgIdCached };
        }
        // Perform basic validation on message and convert to RawGossipsubMessage for fastMsgIdFn()
        const validationResult = await validateToRawMessage(this.globalSignaturePolicy, rpcMsg);
        if (!validationResult.valid) {
            return { code: MessageStatus.invalid, reason: RejectReason.Error, error: validationResult.error };
        }
        const msg = validationResult.message;
        // Try and perform the data transform to the message. If it fails, consider it invalid.
        try {
            if (this.dataTransform != null) {
                msg.data = this.dataTransform.inboundTransform(rpcMsg.topic, msg.data);
            }
        }
        catch (e) {
            this.log('Invalid message, transform failed', e);
            return { code: MessageStatus.invalid, reason: RejectReason.Error, error: ValidateError.TransformFailed };
        }
        // TODO: Check if message is from a blacklisted source or propagation origin
        // - Reject any message from a blacklisted peer
        // - Also reject any message that originated from a blacklisted peer
        // - reject messages claiming to be from ourselves but not locally published
        // Calculate the message id on the transformed data.
        const msgId = await this.msgIdFn(msg);
        const msgIdStr = this.msgIdToStrFn(msgId);
        const messageId = { msgId, msgIdStr };
        // Add the message to the duplicate caches
        if (fastMsgIdStr !== undefined && (this.fastMsgIdCache != null)) {
            const collision = this.fastMsgIdCache.put(fastMsgIdStr, msgIdStr);
            if (collision) {
                this.metrics?.fastMsgIdCacheCollision.inc();
            }
        }
        if (this.seenCache.has(msgIdStr)) {
            return { code: MessageStatus.duplicate, msgIdStr };
        }
        else {
            this.seenCache.put(msgIdStr);
        }
        // (Optional) Provide custom validation here with dynamic validators per topic
        // NOTE: This custom topicValidator() must resolve fast (< 100ms) to allow scores
        // to not penalize peers for long validation times.
        const topicValidator = this.topicValidators.get(rpcMsg.topic);
        if (topicValidator != null) {
            let acceptance;
            // Use try {} catch {} in case topicValidator() is synchronous
            try {
                acceptance = await topicValidator(propagationSource, msg);
            }
            catch (e) {
                const errCode = e.code;
                if (errCode === constants.ERR_TOPIC_VALIDATOR_IGNORE)
                    acceptance = TopicValidatorResult.Ignore;
                if (errCode === constants.ERR_TOPIC_VALIDATOR_REJECT)
                    acceptance = TopicValidatorResult.Reject;
                else
                    acceptance = TopicValidatorResult.Ignore;
            }
            if (acceptance !== TopicValidatorResult.Accept) {
                return { code: MessageStatus.invalid, reason: rejectReasonFromAcceptance(acceptance), msgIdStr };
            }
        }
        return { code: MessageStatus.valid, messageId, msg };
    }
    /**
     * Return score of a peer.
     */
    getScore(peerId) {
        return this.score.score(peerId);
    }
    /**
     * Send an rpc object to a peer with subscriptions
     */
    sendSubscriptions(toPeer, topics, subscribe) {
        this.sendRpc(toPeer, {
            subscriptions: topics.map((topic) => ({ topic, subscribe }))
        });
    }
    /**
     * Handles an rpc control message from a peer
     */
    async handleControlMessage(id, controlMsg) {
        if (controlMsg === undefined) {
            return;
        }
        const iwant = (controlMsg.ihave != null) ? this.handleIHave(id, controlMsg.ihave) : [];
        const ihave = (controlMsg.iwant != null) ? this.handleIWant(id, controlMsg.iwant) : [];
        const prune = (controlMsg.graft != null) ? await this.handleGraft(id, controlMsg.graft) : [];
        (controlMsg.prune != null) && (await this.handlePrune(id, controlMsg.prune));
        if ((iwant.length === 0) && (ihave.length === 0) && (prune.length === 0)) {
            return;
        }
        const sent = this.sendRpc(id, { messages: ihave, control: { iwant, prune } });
        const iwantMessageIds = iwant[0]?.messageIDs;
        if (iwantMessageIds != null) {
            if (sent) {
                this.gossipTracer.addPromise(id, iwantMessageIds);
            }
            else {
                this.metrics?.iwantPromiseUntracked.inc(1);
            }
        }
    }
    /**
     * Whether to accept a message from a peer
     */
    acceptFrom(id) {
        if (this.direct.has(id)) {
            return true;
        }
        const now = Date.now();
        const entry = this.acceptFromWhitelist.get(id);
        if ((entry != null) && entry.messagesAccepted < ACCEPT_FROM_WHITELIST_MAX_MESSAGES && entry.acceptUntil >= now) {
            entry.messagesAccepted += 1;
            return true;
        }
        const score = this.score.score(id);
        if (score >= ACCEPT_FROM_WHITELIST_THRESHOLD_SCORE) {
            // peer is unlikely to be able to drop its score to `graylistThreshold`
            // after 128 messages or 1s
            this.acceptFromWhitelist.set(id, {
                messagesAccepted: 0,
                acceptUntil: now + ACCEPT_FROM_WHITELIST_DURATION_MS
            });
        }
        else {
            this.acceptFromWhitelist.delete(id);
        }
        return score >= this.opts.scoreThresholds.graylistThreshold;
    }
    /**
     * Handles IHAVE messages
     */
    handleIHave(id, ihave) {
        if (ihave.length === 0) {
            return [];
        }
        // we ignore IHAVE gossip from any peer whose score is below the gossips threshold
        const score = this.score.score(id);
        if (score < this.opts.scoreThresholds.gossipThreshold) {
            this.log('IHAVE: ignoring peer %s with score below threshold [ score = %d ]', id, score);
            this.metrics?.ihaveRcvIgnored.inc({ reason: IHaveIgnoreReason.LowScore });
            return [];
        }
        // IHAVE flood protection
        const peerhave = (this.peerhave.get(id) ?? 0) + 1;
        this.peerhave.set(id, peerhave);
        if (peerhave > constants.GossipsubMaxIHaveMessages) {
            this.log('IHAVE: peer %s has advertised too many times (%d) within this heartbeat interval; ignoring', id, peerhave);
            this.metrics?.ihaveRcvIgnored.inc({ reason: IHaveIgnoreReason.MaxIhave });
            return [];
        }
        const iasked = this.iasked.get(id) ?? 0;
        if (iasked >= constants.GossipsubMaxIHaveLength) {
            this.log('IHAVE: peer %s has already advertised too many messages (%d); ignoring', id, iasked);
            this.metrics?.ihaveRcvIgnored.inc({ reason: IHaveIgnoreReason.MaxIasked });
            return [];
        }
        // string msgId => msgId
        const iwant = new Map();
        ihave.forEach(({ topicID, messageIDs }) => {
            if (topicID == null || (messageIDs == null) || !this.mesh.has(topicID)) {
                return;
            }
            let idonthave = 0;
            messageIDs.forEach((msgId) => {
                const msgIdStr = this.msgIdToStrFn(msgId);
                if (!this.seenCache.has(msgIdStr)) {
                    iwant.set(msgIdStr, msgId);
                    idonthave++;
                }
            });
            this.metrics?.onIhaveRcv(topicID, messageIDs.length, idonthave);
        });
        if (iwant.size === 0) {
            return [];
        }
        let iask = iwant.size;
        if (iask + iasked > constants.GossipsubMaxIHaveLength) {
            iask = constants.GossipsubMaxIHaveLength - iasked;
        }
        this.log('IHAVE: Asking for %d out of %d messages from %s', iask, iwant.size, id);
        let iwantList = Array.from(iwant.values());
        // ask in random order
        shuffle(iwantList);
        // truncate to the messages we are actually asking for and update the iasked counter
        iwantList = iwantList.slice(0, iask);
        this.iasked.set(id, iasked + iask);
        // do not add gossipTracer promise here until a successful sendRpc()
        return [
            {
                messageIDs: iwantList
            }
        ];
    }
    /**
     * Handles IWANT messages
     * Returns messages to send back to peer
     */
    handleIWant(id, iwant) {
        if (iwant.length === 0) {
            return [];
        }
        // we don't respond to IWANT requests from any per whose score is below the gossip threshold
        const score = this.score.score(id);
        if (score < this.opts.scoreThresholds.gossipThreshold) {
            this.log('IWANT: ignoring peer %s with score below threshold [score = %d]', id, score);
            return [];
        }
        const ihave = new Map();
        const iwantByTopic = new Map();
        let iwantDonthave = 0;
        iwant.forEach(({ messageIDs }) => {
            messageIDs?.forEach((msgId) => {
                const msgIdStr = this.msgIdToStrFn(msgId);
                const entry = this.mcache.getWithIWantCount(msgIdStr, id);
                if (entry == null) {
                    iwantDonthave++;
                    return;
                }
                iwantByTopic.set(entry.msg.topic, 1 + (iwantByTopic.get(entry.msg.topic) ?? 0));
                if (entry.count > constants.GossipsubGossipRetransmission) {
                    this.log('IWANT: Peer %s has asked for message %s too many times: ignoring request', id, msgId);
                    return;
                }
                ihave.set(msgIdStr, entry.msg);
            });
        });
        this.metrics?.onIwantRcv(iwantByTopic, iwantDonthave);
        if (ihave.size === 0) {
            this.log('IWANT: Could not provide any wanted messages to %s', id);
            return [];
        }
        this.log('IWANT: Sending %d messages to %s', ihave.size, id);
        return Array.from(ihave.values());
    }
    /**
     * Handles Graft messages
     */
    async handleGraft(id, graft) {
        const prune = [];
        const score = this.score.score(id);
        const now = Date.now();
        let doPX = this.opts.doPX;
        graft.forEach(({ topicID }) => {
            if (topicID == null) {
                return;
            }
            const peersInMesh = this.mesh.get(topicID);
            if (peersInMesh == null) {
                // don't do PX when there is an unknown topic to avoid leaking our peers
                doPX = false;
                // spam hardening: ignore GRAFTs for unknown topics
                return;
            }
            // check if peer is already in the mesh; if so do nothing
            if (peersInMesh.has(id)) {
                return;
            }
            // we don't GRAFT to/from direct peers; complain loudly if this happens
            if (this.direct.has(id)) {
                this.log('GRAFT: ignoring request from direct peer %s', id);
                // this is possibly a bug from a non-reciprical configuration; send a PRUNE
                prune.push(topicID);
                // but don't px
                doPX = false;
                return;
            }
            // make sure we are not backing off that peer
            const expire = this.backoff.get(topicID)?.get(id);
            if (typeof expire === 'number' && now < expire) {
                this.log('GRAFT: ignoring backed off peer %s', id);
                // add behavioral penalty
                this.score.addPenalty(id, 1, ScorePenalty.GraftBackoff);
                // no PX
                doPX = false;
                // check the flood cutoff -- is the GRAFT coming too fast?
                const floodCutoff = expire + this.opts.graftFloodThreshold - this.opts.pruneBackoff;
                if (now < floodCutoff) {
                    // extra penalty
                    this.score.addPenalty(id, 1, ScorePenalty.GraftBackoff);
                }
                // refresh the backoff
                this.addBackoff(id, topicID);
                prune.push(topicID);
                return;
            }
            // check the score
            if (score < 0) {
                // we don't GRAFT peers with negative score
                this.log('GRAFT: ignoring peer %s with negative score: score=%d, topic=%s', id, score, topicID);
                // we do send them PRUNE however, because it's a matter of protocol correctness
                prune.push(topicID);
                // but we won't PX to them
                doPX = false;
                // add/refresh backoff so that we don't reGRAFT too early even if the score decays
                this.addBackoff(id, topicID);
                return;
            }
            // check the number of mesh peers; if it is at (or over) Dhi, we only accept grafts
            // from peers with outbound connections; this is a defensive check to restrict potential
            // mesh takeover attacks combined with love bombing
            if (peersInMesh.size >= this.opts.Dhi && !(this.outbound.get(id) ?? false)) {
                prune.push(topicID);
                this.addBackoff(id, topicID);
                return;
            }
            this.log('GRAFT: Add mesh link from %s in %s', id, topicID);
            this.score.graft(id, topicID);
            peersInMesh.add(id);
            this.metrics?.onAddToMesh(topicID, InclusionReason.Subscribed, 1);
        });
        if (prune.length === 0) {
            return [];
        }
        const onUnsubscribe = false;
        return Promise.all(prune.map(async (topic) => this.makePrune(id, topic, doPX, onUnsubscribe)));
    }
    /**
     * Handles Prune messages
     */
    async handlePrune(id, prune) {
        const score = this.score.score(id);
        for (const { topicID, backoff, peers } of prune) {
            if (topicID == null) {
                continue;
            }
            const peersInMesh = this.mesh.get(topicID);
            if (peersInMesh == null) {
                return;
            }
            this.log('PRUNE: Remove mesh link to %s in %s', id, topicID);
            this.score.prune(id, topicID);
            if (peersInMesh.has(id)) {
                peersInMesh.delete(id);
                this.metrics?.onRemoveFromMesh(topicID, ChurnReason.Prune, 1);
            }
            // is there a backoff specified by the peer? if so obey it
            if (typeof backoff === 'number' && backoff > 0) {
                this.doAddBackoff(id, topicID, backoff * 1000);
            }
            else {
                this.addBackoff(id, topicID);
            }
            // PX
            if ((peers != null) && (peers.length > 0)) {
                // we ignore PX from peers with insufficient scores
                if (score < this.opts.scoreThresholds.acceptPXThreshold) {
                    this.log('PRUNE: ignoring PX from peer %s with insufficient score [score = %d, topic = %s]', id, score, topicID);
                    continue;
                }
                await this.pxConnect(peers);
            }
        }
    }
    /**
     * Add standard backoff log for a peer in a topic
     */
    addBackoff(id, topic) {
        this.doAddBackoff(id, topic, this.opts.pruneBackoff);
    }
    /**
     * Add backoff expiry interval for a peer in a topic
     *
     * @param id
     * @param topic
     * @param intervalMs - backoff duration in milliseconds
     */
    doAddBackoff(id, topic, intervalMs) {
        let backoff = this.backoff.get(topic);
        if (backoff == null) {
            backoff = new Map();
            this.backoff.set(topic, backoff);
        }
        const expire = Date.now() + intervalMs;
        const existingExpire = backoff.get(id) ?? 0;
        if (existingExpire < expire) {
            backoff.set(id, expire);
        }
    }
    /**
     * Apply penalties from broken IHAVE/IWANT promises
     */
    applyIwantPenalties() {
        this.gossipTracer.getBrokenPromises().forEach((count, p) => {
            this.log("peer %s didn't follow up in %d IWANT requests; adding penalty", p, count);
            this.score.addPenalty(p, count, ScorePenalty.BrokenPromise);
        });
    }
    /**
     * Clear expired backoff expiries
     */
    clearBackoff() {
        // we only clear once every GossipsubPruneBackoffTicks ticks to avoid iterating over the maps too much
        if (this.heartbeatTicks % constants.GossipsubPruneBackoffTicks !== 0) {
            return;
        }
        const now = Date.now();
        this.backoff.forEach((backoff, topic) => {
            backoff.forEach((expire, id) => {
                // add some slack time to the expiration, see https://github.com/libp2p/specs/pull/289
                if (expire + BACKOFF_SLACK * this.opts.heartbeatInterval < now) {
                    backoff.delete(id);
                }
            });
            if (backoff.size === 0) {
                this.backoff.delete(topic);
            }
        });
    }
    /**
     * Maybe reconnect to direct peers
     */
    async directConnect() {
        const toconnect = [];
        this.direct.forEach((id) => {
            if (!this.streamsOutbound.has(id)) {
                toconnect.push(id);
            }
        });
        await Promise.all(toconnect.map(async (id) => this.connect(id)));
    }
    /**
     * Maybe attempt connection given signed peer records
     */
    async pxConnect(peers) {
        if (peers.length > this.opts.prunePeers) {
            shuffle(peers);
            peers = peers.slice(0, this.opts.prunePeers);
        }
        const toconnect = [];
        await Promise.all(peers.map(async (pi) => {
            if (pi.peerID == null) {
                return;
            }
            const peer = peerIdFromBytes(pi.peerID);
            const p = peer.toString();
            if (this.peers.has(p)) {
                return;
            }
            if (pi.signedPeerRecord == null) {
                toconnect.push(p);
                return;
            }
            // The peer sent us a signed record
            // This is not a record from the peer who sent the record, but another peer who is connected with it
            // Ensure that it is valid
            try {
                if (!(await this.components.peerStore.consumePeerRecord(pi.signedPeerRecord, peer))) {
                    this.log('bogus peer record obtained through px: could not add peer record to address book');
                    return;
                }
                toconnect.push(p);
            }
            catch (e) {
                this.log('bogus peer record obtained through px: invalid signature or not a peer record');
            }
        }));
        if (toconnect.length === 0) {
            return;
        }
        await Promise.all(toconnect.map(async (id) => this.connect(id)));
    }
    /**
     * Connect to a peer using the gossipsub protocol
     */
    async connect(id) {
        this.log('Initiating connection with %s', id);
        const peerId = peerIdFromString(id);
        const connection = await this.components.connectionManager.openConnection(peerId);
        for (const multicodec of this.multicodecs) {
            for (const topology of this.components.registrar.getTopologies(multicodec)) {
                topology.onConnect?.(peerId, connection);
            }
        }
    }
    /**
     * Subscribes to a topic
     */
    subscribe(topic) {
        if (this.status.code !== GossipStatusCode.started) {
            throw new Error('Pubsub has not started');
        }
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.add(topic);
            for (const peerId of this.peers.keys()) {
                this.sendSubscriptions(peerId, [topic], true);
            }
        }
        this.join(topic);
    }
    /**
     * Unsubscribe to a topic
     */
    unsubscribe(topic) {
        if (this.status.code !== GossipStatusCode.started) {
            throw new Error('Pubsub is not started');
        }
        const wasSubscribed = this.subscriptions.delete(topic);
        this.log('unsubscribe from %s - am subscribed %s', topic, wasSubscribed);
        if (wasSubscribed) {
            for (const peerId of this.peers.keys()) {
                this.sendSubscriptions(peerId, [topic], false);
            }
        }
        this.leave(topic);
    }
    /**
     * Join topic
     */
    join(topic) {
        if (this.status.code !== GossipStatusCode.started) {
            throw new Error('Gossipsub has not started');
        }
        // if we are already in the mesh, return
        if (this.mesh.has(topic)) {
            return;
        }
        this.log('JOIN %s', topic);
        this.metrics?.onJoin(topic);
        const toAdd = new Set();
        const backoff = this.backoff.get(topic);
        // check if we have mesh_n peers in fanout[topic] and add them to the mesh if we do,
        // removing the fanout entry.
        const fanoutPeers = this.fanout.get(topic);
        if (fanoutPeers != null) {
            // Remove fanout entry and the last published time
            this.fanout.delete(topic);
            this.fanoutLastpub.delete(topic);
            // remove explicit peers, peers with negative scores, and backoffed peers
            fanoutPeers.forEach((id) => {
                if (!this.direct.has(id) && this.score.score(id) >= 0 && ((backoff == null) || !backoff.has(id))) {
                    toAdd.add(id);
                }
            });
            this.metrics?.onAddToMesh(topic, InclusionReason.Fanout, toAdd.size);
        }
        // check if we need to get more peers, which we randomly select
        if (toAdd.size < this.opts.D) {
            const fanoutCount = toAdd.size;
            const newPeers = this.getRandomGossipPeers(topic, this.opts.D, (id) => 
            // filter direct peers and peers with negative score
            !toAdd.has(id) && !this.direct.has(id) && this.score.score(id) >= 0 && ((backoff == null) || !backoff.has(id)));
            newPeers.forEach((peer) => {
                toAdd.add(peer);
            });
            this.metrics?.onAddToMesh(topic, InclusionReason.Random, toAdd.size - fanoutCount);
        }
        this.mesh.set(topic, toAdd);
        toAdd.forEach((id) => {
            this.log('JOIN: Add mesh link to %s in %s', id, topic);
            this.sendGraft(id, topic);
            // rust-libp2p
            // - peer_score.graft()
            // - Self::control_pool_add()
            // - peer_added_to_mesh()
        });
    }
    /**
     * Leave topic
     */
    leave(topic) {
        if (this.status.code !== GossipStatusCode.started) {
            throw new Error('Gossipsub has not started');
        }
        this.log('LEAVE %s', topic);
        this.metrics?.onLeave(topic);
        // Send PRUNE to mesh peers
        const meshPeers = this.mesh.get(topic);
        if (meshPeers != null) {
            Promise.all(Array.from(meshPeers).map(async (id) => {
                this.log('LEAVE: Remove mesh link to %s in %s', id, topic);
                await this.sendPrune(id, topic);
            })).catch((err) => {
                this.log('Error sending prunes to mesh peers', err);
            });
            this.mesh.delete(topic);
        }
    }
    selectPeersToForward(topic, propagationSource, excludePeers) {
        const tosend = new Set();
        // Add explicit peers
        const peersInTopic = this.topics.get(topic);
        if (peersInTopic != null) {
            this.direct.forEach((peer) => {
                if (peersInTopic.has(peer) && propagationSource !== peer && !(excludePeers?.has(peer) ?? false)) {
                    tosend.add(peer);
                }
            });
            // As of Mar 2022, spec + golang-libp2p include this while rust-libp2p does not
            // rust-libp2p: https://github.com/libp2p/rust-libp2p/blob/6cc3b4ec52c922bfcf562a29b5805c3150e37c75/protocols/gossipsub/src/behaviour.rs#L2693
            // spec: https://github.com/libp2p/specs/blob/10712c55ab309086a52eec7d25f294df4fa96528/pubsub/gossipsub/gossipsub-v1.0.md?plain=1#L361
            this.floodsubPeers.forEach((peer) => {
                if (peersInTopic.has(peer) &&
                    propagationSource !== peer &&
                    !(excludePeers?.has(peer) ?? false) &&
                    this.score.score(peer) >= this.opts.scoreThresholds.publishThreshold) {
                    tosend.add(peer);
                }
            });
        }
        // add mesh peers
        const meshPeers = this.mesh.get(topic);
        if ((meshPeers != null) && meshPeers.size > 0) {
            meshPeers.forEach((peer) => {
                if (propagationSource !== peer && !(excludePeers?.has(peer) ?? false)) {
                    tosend.add(peer);
                }
            });
        }
        return tosend;
    }
    selectPeersToPublish(topic) {
        const tosend = new Set();
        const tosendCount = {
            direct: 0,
            floodsub: 0,
            mesh: 0,
            fanout: 0
        };
        const peersInTopic = this.topics.get(topic);
        if (peersInTopic != null) {
            // flood-publish behavior
            // send to direct peers and _all_ peers meeting the publishThreshold
            if (this.opts.floodPublish) {
                peersInTopic.forEach((id) => {
                    if (this.direct.has(id)) {
                        tosend.add(id);
                        tosendCount.direct++;
                    }
                    else if (this.score.score(id) >= this.opts.scoreThresholds.publishThreshold) {
                        tosend.add(id);
                        tosendCount.floodsub++;
                    }
                });
            }
            else {
                // non-flood-publish behavior
                // send to direct peers, subscribed floodsub peers
                // and some mesh peers above publishThreshold
                // direct peers (if subscribed)
                this.direct.forEach((id) => {
                    if (peersInTopic.has(id)) {
                        tosend.add(id);
                        tosendCount.direct++;
                    }
                });
                // floodsub peers
                // Note: if there are no floodsub peers, we save a loop through peersInTopic Map
                this.floodsubPeers.forEach((id) => {
                    if (peersInTopic.has(id) && this.score.score(id) >= this.opts.scoreThresholds.publishThreshold) {
                        tosend.add(id);
                        tosendCount.floodsub++;
                    }
                });
                // Gossipsub peers handling
                const meshPeers = this.mesh.get(topic);
                if ((meshPeers != null) && meshPeers.size > 0) {
                    meshPeers.forEach((peer) => {
                        tosend.add(peer);
                        tosendCount.mesh++;
                    });
                    // eslint-disable-next-line @typescript-eslint/brace-style
                }
                // We are not in the mesh for topic, use fanout peers
                else {
                    const fanoutPeers = this.fanout.get(topic);
                    if ((fanoutPeers != null) && fanoutPeers.size > 0) {
                        fanoutPeers.forEach((peer) => {
                            tosend.add(peer);
                            tosendCount.fanout++;
                        });
                        // eslint-disable-next-line @typescript-eslint/brace-style
                    }
                    // We have no fanout peers, select mesh_n of them and add them to the fanout
                    else {
                        // If we are not in the fanout, then pick peers in topic above the publishThreshold
                        const newFanoutPeers = this.getRandomGossipPeers(topic, this.opts.D, (id) => {
                            return this.score.score(id) >= this.opts.scoreThresholds.publishThreshold;
                        });
                        // eslint-disable-next-line max-depth
                        if (newFanoutPeers.size > 0) {
                            this.fanout.set(topic, newFanoutPeers);
                            newFanoutPeers.forEach((peer) => {
                                tosend.add(peer);
                                tosendCount.fanout++;
                            });
                        }
                    }
                    // We are publishing to fanout peers - update the time we published
                    this.fanoutLastpub.set(topic, Date.now());
                }
            }
        }
        return { tosend, tosendCount };
    }
    /**
     * Forwards a message from our peers.
     *
     * For messages published by us (the app layer), this class uses `publish`
     */
    forwardMessage(msgIdStr, rawMsg, propagationSource, excludePeers) {
        // message is fully validated inform peer_score
        if (propagationSource != null) {
            this.score.deliverMessage(propagationSource, msgIdStr, rawMsg.topic);
        }
        const tosend = this.selectPeersToForward(rawMsg.topic, propagationSource, excludePeers);
        // Note: Don't throw if tosend is empty, we can have a mesh with a single peer
        // forward the message to peers
        tosend.forEach((id) => {
            // sendRpc may mutate RPC message on piggyback, create a new message for each peer
            this.sendRpc(id, { messages: [rawMsg] });
        });
        this.metrics?.onForwardMsg(rawMsg.topic, tosend.size);
    }
    /**
     * App layer publishes a message to peers, return number of peers this message is published to
     * Note: `async` due to crypto only if `StrictSign`, otherwise it's a sync fn.
     *
     * For messages not from us, this class uses `forwardMessage`.
     */
    async publish(topic, data, opts) {
        const startMs = Date.now();
        const transformedData = (this.dataTransform != null) ? this.dataTransform.outboundTransform(topic, data) : data;
        if (this.publishConfig == null) {
            throw Error('PublishError.Uninitialized');
        }
        // Prepare raw message with user's publishConfig
        const { raw: rawMsg, msg } = await buildRawMessage(this.publishConfig, topic, data, transformedData);
        // calculate the message id from the un-transformed data
        const msgId = await this.msgIdFn(msg);
        const msgIdStr = this.msgIdToStrFn(msgId);
        // Current publish opt takes precedence global opts, while preserving false value
        const ignoreDuplicatePublishError = opts?.ignoreDuplicatePublishError ?? this.opts.ignoreDuplicatePublishError;
        if (this.seenCache.has(msgIdStr)) {
            // This message has already been seen. We don't re-publish messages that have already
            // been published on the network.
            if (ignoreDuplicatePublishError) {
                this.metrics?.onPublishDuplicateMsg(topic);
                return { recipients: [] };
            }
            throw Error('PublishError.Duplicate');
        }
        const { tosend, tosendCount } = this.selectPeersToPublish(topic);
        const willSendToSelf = this.opts.emitSelf && this.subscriptions.has(topic);
        // Current publish opt takes precedence global opts, while preserving false value
        const allowPublishToZeroPeers = opts?.allowPublishToZeroPeers ?? this.opts.allowPublishToZeroPeers;
        if (tosend.size === 0 && !allowPublishToZeroPeers && !willSendToSelf) {
            throw Error('PublishError.InsufficientPeers');
        }
        // If the message isn't a duplicate and we have sent it to some peers add it to the
        // duplicate cache and memcache.
        this.seenCache.put(msgIdStr);
        // all published messages are valid
        this.mcache.put({ msgId, msgIdStr }, rawMsg, true);
        // If the message is anonymous or has a random author add it to the published message ids cache.
        this.publishedMessageIds.put(msgIdStr);
        const batchPublish = opts?.batchPublish ?? this.opts.batchPublish;
        const rpc = { messages: [rawMsg] };
        if (batchPublish) {
            this.sendRpcInBatch(tosend, rpc);
        }
        else {
            // Send to set of peers aggregated from direct, mesh, fanout
            for (const id of tosend) {
                // sendRpc may mutate RPC message on piggyback, create a new message for each peer
                const sent = this.sendRpc(id, rpc);
                // did not actually send the message
                if (!sent) {
                    tosend.delete(id);
                }
            }
        }
        const durationMs = Date.now() - startMs;
        this.metrics?.onPublishMsg(topic, tosendCount, tosend.size, rawMsg.data != null ? rawMsg.data.length : 0, durationMs);
        // Dispatch the message to the user if we are subscribed to the topic
        if (willSendToSelf) {
            tosend.add(this.components.peerId.toString());
            super.dispatchEvent(new CustomEvent('gossipsub:message', {
                detail: {
                    propagationSource: this.components.peerId,
                    msgId: msgIdStr,
                    msg
                }
            }));
            // TODO: Add option to switch between emit per topic or all messages in one
            super.dispatchEvent(new CustomEvent('message', { detail: msg }));
        }
        return {
            recipients: Array.from(tosend.values()).map((str) => peerIdFromString(str))
        };
    }
    /**
     * Send the same data in batch to tosend list without considering cached control messages
     * This is not only faster but also avoid allocating memory for each peer
     * see https://github.com/ChainSafe/js-libp2p-gossipsub/issues/344
     */
    sendRpcInBatch(tosend, rpc) {
        const rpcBytes = RPC.encode(rpc).finish();
        const prefixedData = encode.single(rpcBytes);
        for (const id of tosend) {
            const outboundStream = this.streamsOutbound.get(id);
            if (outboundStream == null) {
                this.log(`Cannot send RPC to ${id} as there is no open stream to it available`);
                tosend.delete(id);
                continue;
            }
            try {
                outboundStream.pushPrefixed(prefixedData);
            }
            catch (e) {
                tosend.delete(id);
                this.log.error(`Cannot send rpc to ${id}`, e);
            }
            this.metrics?.onRpcSent(rpc, rpcBytes.length);
        }
    }
    /**
     * This function should be called when `asyncValidation` is `true` after
     * the message got validated by the caller. Messages are stored in the `mcache` and
     * validation is expected to be fast enough that the messages should still exist in the cache.
     * There are three possible validation outcomes and the outcome is given in acceptance.
     *
     * If acceptance = `MessageAcceptance.Accept` the message will get propagated to the
     * network. The `propagation_source` parameter indicates who the message was received by and
     * will not be forwarded back to that peer.
     *
     * If acceptance = `MessageAcceptance.Reject` the message will be deleted from the memcache
     * and the P₄ penalty will be applied to the `propagationSource`.
     *
     * If acceptance = `MessageAcceptance.Ignore` the message will be deleted from the memcache
     * but no P₄ penalty will be applied.
     *
     * This function will return true if the message was found in the cache and false if was not
     * in the cache anymore.
     *
     * This should only be called once per message.
     */
    reportMessageValidationResult(msgId, propagationSource, acceptance) {
        let cacheEntry;
        if (acceptance === TopicValidatorResult.Accept) {
            cacheEntry = this.mcache.validate(msgId);
            if (cacheEntry != null) {
                const { message: rawMsg, originatingPeers } = cacheEntry;
                // message is fully validated inform peer_score
                this.score.deliverMessage(propagationSource, msgId, rawMsg.topic);
                this.forwardMessage(msgId, cacheEntry.message, propagationSource, originatingPeers);
            }
            // else, Message not in cache. Ignoring forwarding
            // eslint-disable-next-line @typescript-eslint/brace-style
        }
        // Not valid
        else {
            cacheEntry = this.mcache.remove(msgId);
            if (cacheEntry != null) {
                const rejectReason = rejectReasonFromAcceptance(acceptance);
                const { message: rawMsg, originatingPeers } = cacheEntry;
                // Tell peer_score about reject
                // Reject the original source, and any duplicates we've seen from other peers.
                this.score.rejectMessage(propagationSource, msgId, rawMsg.topic, rejectReason);
                for (const peer of originatingPeers) {
                    this.score.rejectMessage(peer, msgId, rawMsg.topic, rejectReason);
                }
            }
            // else, Message not in cache. Ignoring forwarding
        }
        const firstSeenTimestampMs = this.score.messageFirstSeenTimestampMs(msgId);
        this.metrics?.onReportValidation(cacheEntry, acceptance, firstSeenTimestampMs);
    }
    /**
     * Sends a GRAFT message to a peer
     */
    sendGraft(id, topic) {
        const graft = [
            {
                topicID: topic
            }
        ];
        this.sendRpc(id, { control: { graft } });
    }
    /**
     * Sends a PRUNE message to a peer
     */
    async sendPrune(id, topic) {
        // this is only called from leave() function
        const onUnsubscribe = true;
        const prune = [await this.makePrune(id, topic, this.opts.doPX, onUnsubscribe)];
        this.sendRpc(id, { control: { prune } });
    }
    /**
     * Send an rpc object to a peer
     */
    sendRpc(id, rpc) {
        const outboundStream = this.streamsOutbound.get(id);
        if (outboundStream == null) {
            this.log(`Cannot send RPC to ${id} as there is no open stream to it available`);
            return false;
        }
        // piggyback control message retries
        const ctrl = this.control.get(id);
        if (ctrl != null) {
            this.piggybackControl(id, rpc, ctrl);
            this.control.delete(id);
        }
        // piggyback gossip
        const ihave = this.gossip.get(id);
        if (ihave != null) {
            this.piggybackGossip(id, rpc, ihave);
            this.gossip.delete(id);
        }
        const rpcBytes = RPC.encode(rpc).finish();
        try {
            outboundStream.push(rpcBytes);
        }
        catch (e) {
            this.log.error(`Cannot send rpc to ${id}`, e);
            // if the peer had control messages or gossip, re-attach
            if (ctrl != null) {
                this.control.set(id, ctrl);
            }
            if (ihave != null) {
                this.gossip.set(id, ihave);
            }
            return false;
        }
        this.metrics?.onRpcSent(rpc, rpcBytes.length);
        return true;
    }
    /** Mutates `outRpc` adding graft and prune control messages */
    piggybackControl(id, outRpc, ctrl) {
        if (ctrl.graft != null) {
            if (outRpc.control == null)
                outRpc.control = {};
            if (outRpc.control.graft == null)
                outRpc.control.graft = [];
            for (const graft of ctrl.graft) {
                if (graft.topicID != null && (this.mesh.get(graft.topicID)?.has(id) ?? false)) {
                    outRpc.control.graft.push(graft);
                }
            }
        }
        if (ctrl.prune != null) {
            if (outRpc.control == null)
                outRpc.control = {};
            if (outRpc.control.prune == null)
                outRpc.control.prune = [];
            for (const prune of ctrl.prune) {
                if (prune.topicID != null && !(this.mesh.get(prune.topicID)?.has(id) ?? false)) {
                    outRpc.control.prune.push(prune);
                }
            }
        }
    }
    /** Mutates `outRpc` adding ihave control messages */
    piggybackGossip(id, outRpc, ihave) {
        if (outRpc.control == null)
            outRpc.control = {};
        outRpc.control.ihave = ihave;
    }
    /**
     * Send graft and prune messages
     *
     * @param tograft - peer id => topic[]
     * @param toprune - peer id => topic[]
     */
    async sendGraftPrune(tograft, toprune, noPX) {
        const doPX = this.opts.doPX;
        const onUnsubscribe = false;
        for (const [id, topics] of tograft) {
            const graft = topics.map((topicID) => ({ topicID }));
            let prune = [];
            // If a peer also has prunes, process them now
            const pruning = toprune.get(id);
            if (pruning != null) {
                prune = await Promise.all(pruning.map(async (topicID) => this.makePrune(id, topicID, doPX && !(noPX.get(id) ?? false), onUnsubscribe)));
                toprune.delete(id);
            }
            this.sendRpc(id, { control: { graft, prune } });
        }
        for (const [id, topics] of toprune) {
            const prune = await Promise.all(topics.map(async (topicID) => this.makePrune(id, topicID, doPX && !(noPX.get(id) ?? false), onUnsubscribe)));
            this.sendRpc(id, { control: { prune } });
        }
    }
    /**
     * Emits gossip - Send IHAVE messages to a random set of gossip peers
     */
    emitGossip(peersToGossipByTopic) {
        const gossipIDsByTopic = this.mcache.getGossipIDs(new Set(peersToGossipByTopic.keys()));
        for (const [topic, peersToGossip] of peersToGossipByTopic) {
            this.doEmitGossip(topic, peersToGossip, gossipIDsByTopic.get(topic) ?? []);
        }
    }
    /**
     * Send gossip messages to GossipFactor peers above threshold with a minimum of D_lazy
     * Peers are randomly selected from the heartbeat which exclude mesh + fanout peers
     * We also exclude direct peers, as there is no reason to emit gossip to them
     *
     * @param topic
     * @param candidateToGossip - peers to gossip
     * @param messageIDs - message ids to gossip
     */
    doEmitGossip(topic, candidateToGossip, messageIDs) {
        if (messageIDs.length === 0) {
            return;
        }
        // shuffle to emit in random order
        shuffle(messageIDs);
        // if we are emitting more than GossipsubMaxIHaveLength ids, truncate the list
        if (messageIDs.length > constants.GossipsubMaxIHaveLength) {
            // we do the truncation (with shuffling) per peer below
            this.log('too many messages for gossip; will truncate IHAVE list (%d messages)', messageIDs.length);
        }
        if (candidateToGossip.size === 0)
            return;
        let target = this.opts.Dlazy;
        const factor = constants.GossipsubGossipFactor * candidateToGossip.size;
        let peersToGossip = candidateToGossip;
        if (factor > target) {
            target = factor;
        }
        if (target > peersToGossip.size) {
            target = peersToGossip.size;
        }
        else {
            // only shuffle if needed
            peersToGossip = shuffle(Array.from(peersToGossip)).slice(0, target);
        }
        // Emit the IHAVE gossip to the selected peers up to the target
        peersToGossip.forEach((id) => {
            let peerMessageIDs = messageIDs;
            if (messageIDs.length > constants.GossipsubMaxIHaveLength) {
                // shuffle and slice message IDs per peer so that we emit a different set for each peer
                // we have enough reduncancy in the system that this will significantly increase the message
                // coverage when we do truncate
                peerMessageIDs = shuffle(peerMessageIDs.slice()).slice(0, constants.GossipsubMaxIHaveLength);
            }
            this.pushGossip(id, {
                topicID: topic,
                messageIDs: peerMessageIDs
            });
        });
    }
    /**
     * Flush gossip and control messages
     */
    flush() {
        // send gossip first, which will also piggyback control
        for (const [peer, ihave] of this.gossip.entries()) {
            this.gossip.delete(peer);
            this.sendRpc(peer, { control: { ihave } });
        }
        // send the remaining control messages
        for (const [peer, control] of this.control.entries()) {
            this.control.delete(peer);
            this.sendRpc(peer, { control: { graft: control.graft, prune: control.prune } });
        }
    }
    /**
     * Adds new IHAVE messages to pending gossip
     */
    pushGossip(id, controlIHaveMsgs) {
        this.log('Add gossip to %s', id);
        const gossip = this.gossip.get(id) ?? [];
        this.gossip.set(id, gossip.concat(controlIHaveMsgs));
    }
    /**
     * Make a PRUNE control message for a peer in a topic
     */
    async makePrune(id, topic, doPX, onUnsubscribe) {
        this.score.prune(id, topic);
        if (this.streamsOutbound.get(id)?.protocol === constants.GossipsubIDv10) {
            // Gossipsub v1.0 -- no backoff, the peer won't be able to parse it anyway
            return {
                topicID: topic,
                peers: []
            };
        }
        // backoff is measured in seconds
        // GossipsubPruneBackoff and GossipsubUnsubscribeBackoff are measured in milliseconds
        // The protobuf has it as a uint64
        const backoffMs = onUnsubscribe ? this.opts.unsubcribeBackoff : this.opts.pruneBackoff;
        const backoff = backoffMs / 1000;
        this.doAddBackoff(id, topic, backoffMs);
        if (!doPX) {
            return {
                topicID: topic,
                peers: [],
                backoff
            };
        }
        // select peers for Peer eXchange
        const peers = this.getRandomGossipPeers(topic, this.opts.prunePeers, (xid) => {
            return xid !== id && this.score.score(xid) >= 0;
        });
        const px = await Promise.all(Array.from(peers).map(async (peerId) => {
            // see if we have a signed record to send back; if we don't, just send
            // the peer ID and let the pruned peer find them in the DHT -- we can't trust
            // unsigned address records through PX anyways
            // Finding signed records in the DHT is not supported at the time of writing in js-libp2p
            const id = peerIdFromString(peerId);
            let peerInfo;
            try {
                peerInfo = await this.components.peerStore.get(id);
            }
            catch (err) {
                if (err.code !== 'ERR_NOT_FOUND') {
                    throw err;
                }
            }
            return {
                peerID: id.toBytes(),
                signedPeerRecord: peerInfo?.peerRecordEnvelope
            };
        }));
        return {
            topicID: topic,
            peers: px,
            backoff
        };
    }
    runHeartbeat = () => {
        const timer = this.metrics?.heartbeatDuration.startTimer();
        this.heartbeat()
            .catch((err) => {
            this.log('Error running heartbeat', err);
        })
            .finally(() => {
            if (timer != null) {
                timer();
            }
            // Schedule the next run if still in started status
            if (this.status.code === GossipStatusCode.started) {
                // Clear previous timeout before overwriting `status.heartbeatTimeout`, it should be completed tho.
                clearTimeout(this.status.heartbeatTimeout);
                // NodeJS setInterval function is innexact, calls drift by a few miliseconds on each call.
                // To run the heartbeat precisely setTimeout() must be used recomputing the delay on every loop.
                let msToNextHeartbeat = this.opts.heartbeatInterval - ((Date.now() - this.status.hearbeatStartMs) % this.opts.heartbeatInterval);
                // If too close to next heartbeat, skip one
                if (msToNextHeartbeat < this.opts.heartbeatInterval * 0.25) {
                    msToNextHeartbeat += this.opts.heartbeatInterval;
                    this.metrics?.heartbeatSkipped.inc();
                }
                this.status.heartbeatTimeout = setTimeout(this.runHeartbeat, msToNextHeartbeat);
            }
        });
    };
    /**
     * Maintains the mesh and fanout maps in gossipsub.
     */
    async heartbeat() {
        const { D, Dlo, Dhi, Dscore, Dout, fanoutTTL } = this.opts;
        this.heartbeatTicks++;
        // cache scores throught the heartbeat
        const scores = new Map();
        const getScore = (id) => {
            let s = scores.get(id);
            if (s === undefined) {
                s = this.score.score(id);
                scores.set(id, s);
            }
            return s;
        };
        // peer id => topic[]
        const tograft = new Map();
        // peer id => topic[]
        const toprune = new Map();
        // peer id => don't px
        const noPX = new Map();
        // clean up expired backoffs
        this.clearBackoff();
        // clean up peerhave/iasked counters
        this.peerhave.clear();
        this.metrics?.cacheSize.set({ cache: 'iasked' }, this.iasked.size);
        this.iasked.clear();
        // apply IWANT request penalties
        this.applyIwantPenalties();
        // ensure direct peers are connected
        if (this.heartbeatTicks % this.opts.directConnectTicks === 0) {
            // we only do this every few ticks to allow pending connections to complete and account for restarts/downtime
            await this.directConnect();
        }
        // EXTRA: Prune caches
        this.fastMsgIdCache?.prune();
        this.seenCache.prune();
        this.gossipTracer.prune();
        this.publishedMessageIds.prune();
        /**
         * Instead of calling getRandomGossipPeers multiple times to:
         * + get more mesh peers
         * + more outbound peers
         * + oppportunistic grafting
         * + emitGossip
         *
         * We want to loop through the topic peers only a single time and prepare gossip peers for all topics to improve the performance
         */
        const peersToGossipByTopic = new Map();
        // maintain the mesh for topics we have joined
        // eslint-disable-next-line complexity
        this.mesh.forEach((peers, topic) => {
            const peersInTopic = this.topics.get(topic);
            const candidateMeshPeers = new Set();
            const peersToGossip = new Set();
            peersToGossipByTopic.set(topic, peersToGossip);
            if (peersInTopic != null) {
                const shuffledPeers = shuffle(Array.from(peersInTopic));
                const backoff = this.backoff.get(topic);
                for (const id of shuffledPeers) {
                    const peerStreams = this.streamsOutbound.get(id);
                    if ((peerStreams != null) &&
                        this.multicodecs.includes(peerStreams.protocol) &&
                        !peers.has(id) &&
                        !this.direct.has(id)) {
                        const score = getScore(id);
                        if (((backoff == null) || !backoff.has(id)) && score >= 0)
                            candidateMeshPeers.add(id);
                        // instead of having to find gossip peers after heartbeat which require another loop
                        // we prepare peers to gossip in a topic within heartbeat to improve performance
                        if (score >= this.opts.scoreThresholds.gossipThreshold)
                            peersToGossip.add(id);
                    }
                }
            }
            // prune/graft helper functions (defined per topic)
            const prunePeer = (id, reason) => {
                this.log('HEARTBEAT: Remove mesh link to %s in %s', id, topic);
                // no need to update peer score here as we do it in makePrune
                // add prune backoff record
                this.addBackoff(id, topic);
                // remove peer from mesh
                peers.delete(id);
                // after pruning a peer from mesh, we want to gossip topic to it if its score meet the gossip threshold
                if (getScore(id) >= this.opts.scoreThresholds.gossipThreshold)
                    peersToGossip.add(id);
                this.metrics?.onRemoveFromMesh(topic, reason, 1);
                // add to toprune
                const topics = toprune.get(id);
                if (topics == null) {
                    toprune.set(id, [topic]);
                }
                else {
                    topics.push(topic);
                }
            };
            const graftPeer = (id, reason) => {
                this.log('HEARTBEAT: Add mesh link to %s in %s', id, topic);
                // update peer score
                this.score.graft(id, topic);
                // add peer to mesh
                peers.add(id);
                // when we add a new mesh peer, we don't want to gossip messages to it
                peersToGossip.delete(id);
                this.metrics?.onAddToMesh(topic, reason, 1);
                // add to tograft
                const topics = tograft.get(id);
                if (topics == null) {
                    tograft.set(id, [topic]);
                }
                else {
                    topics.push(topic);
                }
            };
            // drop all peers with negative score, without PX
            peers.forEach((id) => {
                const score = getScore(id);
                // Record the score
                if (score < 0) {
                    this.log('HEARTBEAT: Prune peer %s with negative score: score=%d, topic=%s', id, score, topic);
                    prunePeer(id, ChurnReason.BadScore);
                    noPX.set(id, true);
                }
            });
            // do we have enough peers?
            if (peers.size < Dlo) {
                const ineed = D - peers.size;
                // slice up to first `ineed` items and remove them from candidateMeshPeers
                // same to `const newMeshPeers = candidateMeshPeers.slice(0, ineed)`
                const newMeshPeers = removeFirstNItemsFromSet(candidateMeshPeers, ineed);
                newMeshPeers.forEach((p) => {
                    graftPeer(p, InclusionReason.NotEnough);
                });
            }
            // do we have to many peers?
            if (peers.size > Dhi) {
                let peersArray = Array.from(peers);
                // sort by score
                peersArray.sort((a, b) => getScore(b) - getScore(a));
                // We keep the first D_score peers by score and the remaining up to D randomly
                // under the constraint that we keep D_out peers in the mesh (if we have that many)
                peersArray = peersArray.slice(0, Dscore).concat(shuffle(peersArray.slice(Dscore)));
                // count the outbound peers we are keeping
                let outbound = 0;
                peersArray.slice(0, D).forEach((p) => {
                    if (this.outbound.get(p) ?? false) {
                        outbound++;
                    }
                });
                // if it's less than D_out, bubble up some outbound peers from the random selection
                if (outbound < Dout) {
                    const rotate = (i) => {
                        // rotate the peersArray to the right and put the ith peer in the front
                        const p = peersArray[i];
                        for (let j = i; j > 0; j--) {
                            peersArray[j] = peersArray[j - 1];
                        }
                        peersArray[0] = p;
                    };
                    // first bubble up all outbound peers already in the selection to the front
                    if (outbound > 0) {
                        let ihave = outbound;
                        for (let i = 1; i < D && ihave > 0; i++) {
                            // eslint-disable-next-line max-depth
                            if (this.outbound.get(peersArray[i]) ?? false) {
                                rotate(i);
                                ihave--;
                            }
                        }
                    }
                    // now bubble up enough outbound peers outside the selection to the front
                    let ineed = D - outbound;
                    for (let i = D; i < peersArray.length && ineed > 0; i++) {
                        if (this.outbound.get(peersArray[i]) ?? false) {
                            rotate(i);
                            ineed--;
                        }
                    }
                }
                // prune the excess peers
                peersArray.slice(D).forEach((p) => {
                    prunePeer(p, ChurnReason.Excess);
                });
            }
            // do we have enough outbound peers?
            if (peers.size >= Dlo) {
                // count the outbound peers we have
                let outbound = 0;
                peers.forEach((p) => {
                    if (this.outbound.get(p) ?? false) {
                        outbound++;
                    }
                });
                // if it's less than D_out, select some peers with outbound connections and graft them
                if (outbound < Dout) {
                    const ineed = Dout - outbound;
                    const newMeshPeers = removeItemsFromSet(candidateMeshPeers, ineed, (id) => this.outbound.get(id) === true);
                    newMeshPeers.forEach((p) => {
                        graftPeer(p, InclusionReason.Outbound);
                    });
                }
            }
            // should we try to improve the mesh with opportunistic grafting?
            if (this.heartbeatTicks % this.opts.opportunisticGraftTicks === 0 && peers.size > 1) {
                // Opportunistic grafting works as follows: we check the median score of peers in the
                // mesh; if this score is below the opportunisticGraftThreshold, we select a few peers at
                // random with score over the median.
                // The intention is to (slowly) improve an underperforming mesh by introducing good
                // scoring peers that may have been gossiping at us. This allows us to get out of sticky
                // situations where we are stuck with poor peers and also recover from churn of good peers.
                // now compute the median peer score in the mesh
                const peersList = Array.from(peers).sort((a, b) => getScore(a) - getScore(b));
                const medianIndex = Math.floor(peers.size / 2);
                const medianScore = getScore(peersList[medianIndex]);
                // if the median score is below the threshold, select a better peer (if any) and GRAFT
                if (medianScore < this.opts.scoreThresholds.opportunisticGraftThreshold) {
                    const ineed = this.opts.opportunisticGraftPeers;
                    const newMeshPeers = removeItemsFromSet(candidateMeshPeers, ineed, (id) => getScore(id) > medianScore);
                    for (const id of newMeshPeers) {
                        this.log('HEARTBEAT: Opportunistically graft peer %s on topic %s', id, topic);
                        graftPeer(id, InclusionReason.Opportunistic);
                    }
                }
            }
        });
        // expire fanout for topics we haven't published to in a while
        const now = Date.now();
        this.fanoutLastpub.forEach((lastpb, topic) => {
            if (lastpb + fanoutTTL < now) {
                this.fanout.delete(topic);
                this.fanoutLastpub.delete(topic);
            }
        });
        // maintain our fanout for topics we are publishing but we have not joined
        this.fanout.forEach((fanoutPeers, topic) => {
            // checks whether our peers are still in the topic and have a score above the publish threshold
            const topicPeers = this.topics.get(topic);
            fanoutPeers.forEach((id) => {
                if (!(topicPeers?.has(id) ?? false) || getScore(id) < this.opts.scoreThresholds.publishThreshold) {
                    fanoutPeers.delete(id);
                }
            });
            const peersInTopic = this.topics.get(topic);
            const candidateFanoutPeers = [];
            // the fanout map contains topics to which we are not subscribed.
            const peersToGossip = new Set();
            peersToGossipByTopic.set(topic, peersToGossip);
            if (peersInTopic != null) {
                const shuffledPeers = shuffle(Array.from(peersInTopic));
                for (const id of shuffledPeers) {
                    const peerStreams = this.streamsOutbound.get(id);
                    if ((peerStreams != null) &&
                        this.multicodecs.includes(peerStreams.protocol) &&
                        !fanoutPeers.has(id) &&
                        !this.direct.has(id)) {
                        const score = getScore(id);
                        if (score >= this.opts.scoreThresholds.publishThreshold)
                            candidateFanoutPeers.push(id);
                        // instead of having to find gossip peers after heartbeat which require another loop
                        // we prepare peers to gossip in a topic within heartbeat to improve performance
                        if (score >= this.opts.scoreThresholds.gossipThreshold)
                            peersToGossip.add(id);
                    }
                }
            }
            // do we need more peers?
            if (fanoutPeers.size < D) {
                const ineed = D - fanoutPeers.size;
                candidateFanoutPeers.slice(0, ineed).forEach((id) => {
                    fanoutPeers.add(id);
                    peersToGossip?.delete(id);
                });
            }
        });
        this.emitGossip(peersToGossipByTopic);
        // send coalesced GRAFT/PRUNE messages (will piggyback gossip)
        await this.sendGraftPrune(tograft, toprune, noPX);
        // flush pending gossip that wasn't piggybacked above
        this.flush();
        // advance the message history window
        this.mcache.shift();
        this.dispatchEvent(new CustomEvent('gossipsub:heartbeat'));
    }
    /**
     * Given a topic, returns up to count peers subscribed to that topic
     * that pass an optional filter function
     *
     * @param topic
     * @param count
     * @param filter - a function to filter acceptable peers
     */
    getRandomGossipPeers(topic, count, filter = () => true) {
        const peersInTopic = this.topics.get(topic);
        if (peersInTopic == null) {
            return new Set();
        }
        // Adds all peers using our protocol
        // that also pass the filter function
        let peers = [];
        peersInTopic.forEach((id) => {
            const peerStreams = this.streamsOutbound.get(id);
            if (peerStreams == null) {
                return;
            }
            if (this.multicodecs.includes(peerStreams.protocol) && filter(id)) {
                peers.push(id);
            }
        });
        // Pseudo-randomly shuffles peers
        peers = shuffle(peers);
        if (count > 0 && peers.length > count) {
            peers = peers.slice(0, count);
        }
        return new Set(peers);
    }
    onScrapeMetrics(metrics) {
        /* Data structure sizes */
        metrics.mcacheSize.set(this.mcache.size);
        metrics.mcacheNotValidatedCount.set(this.mcache.notValidatedCount);
        // Arbitrary size
        metrics.cacheSize.set({ cache: 'direct' }, this.direct.size);
        metrics.cacheSize.set({ cache: 'seenCache' }, this.seenCache.size);
        metrics.cacheSize.set({ cache: 'fastMsgIdCache' }, this.fastMsgIdCache?.size ?? 0);
        metrics.cacheSize.set({ cache: 'publishedMessageIds' }, this.publishedMessageIds.size);
        metrics.cacheSize.set({ cache: 'mcache' }, this.mcache.size);
        metrics.cacheSize.set({ cache: 'score' }, this.score.size);
        metrics.cacheSize.set({ cache: 'gossipTracer.promises' }, this.gossipTracer.size);
        metrics.cacheSize.set({ cache: 'gossipTracer.requests' }, this.gossipTracer.requestMsByMsgSize);
        // Bounded by topic
        metrics.cacheSize.set({ cache: 'topics' }, this.topics.size);
        metrics.cacheSize.set({ cache: 'subscriptions' }, this.subscriptions.size);
        metrics.cacheSize.set({ cache: 'mesh' }, this.mesh.size);
        metrics.cacheSize.set({ cache: 'fanout' }, this.fanout.size);
        // Bounded by peer
        metrics.cacheSize.set({ cache: 'peers' }, this.peers.size);
        metrics.cacheSize.set({ cache: 'streamsOutbound' }, this.streamsOutbound.size);
        metrics.cacheSize.set({ cache: 'streamsInbound' }, this.streamsInbound.size);
        metrics.cacheSize.set({ cache: 'acceptFromWhitelist' }, this.acceptFromWhitelist.size);
        metrics.cacheSize.set({ cache: 'gossip' }, this.gossip.size);
        metrics.cacheSize.set({ cache: 'control' }, this.control.size);
        metrics.cacheSize.set({ cache: 'peerhave' }, this.peerhave.size);
        metrics.cacheSize.set({ cache: 'outbound' }, this.outbound.size);
        // 2D nested data structure
        let backoffSize = 0;
        const now = Date.now();
        metrics.connectedPeersBackoffSec.reset();
        for (const backoff of this.backoff.values()) {
            backoffSize += backoff.size;
            for (const [peer, expiredMs] of backoff.entries()) {
                if (this.peers.has(peer)) {
                    metrics.connectedPeersBackoffSec.observe(Math.max(0, expiredMs - now) / 1000);
                }
            }
        }
        metrics.cacheSize.set({ cache: 'backoff' }, backoffSize);
        // Peer counts
        for (const [topicStr, peers] of this.topics) {
            metrics.topicPeersCount.set({ topicStr }, peers.size);
        }
        for (const [topicStr, peers] of this.mesh) {
            metrics.meshPeerCounts.set({ topicStr }, peers.size);
        }
        // Peer scores
        const scores = [];
        const scoreByPeer = new Map();
        metrics.behaviourPenalty.reset();
        for (const peerIdStr of this.peers.keys()) {
            const score = this.score.score(peerIdStr);
            scores.push(score);
            scoreByPeer.set(peerIdStr, score);
            metrics.behaviourPenalty.observe(this.score.peerStats.get(peerIdStr)?.behaviourPenalty ?? 0);
        }
        metrics.registerScores(scores, this.opts.scoreThresholds);
        // Breakdown score per mesh topicLabel
        metrics.registerScorePerMesh(this.mesh, scoreByPeer);
        // Breakdown on each score weight
        const sw = computeAllPeersScoreWeights(this.peers.keys(), this.score.peerStats, this.score.params, this.score.peerIPs, metrics.topicStrToLabel);
        metrics.registerScoreWeights(sw);
    }
}
export function gossipsub(init = {}) {
    return (components) => new GossipSub(components, init);
}
//# sourceMappingURL=index.js.map