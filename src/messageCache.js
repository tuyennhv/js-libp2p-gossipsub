const RPC = require('./message').rpc.RPC
const utils = require('./utils')
/**
 * This file implements the Message Cache API provided in https://github.com/libp2p/go-libp2p-pubsub/blob/master/mcache.go#L15 used in gossip sub to store messages that were sent for the last few heartbeat ticks.
 */


class CacheEntry {

    /**
     * @param {String}
     * @param {String[]}
     * @constructor
     */
    constructor (msgID, topics) {
        this.msgID = msgID
	this.topics = topics
    }

}

class MessageCache {

    /**
     * @param {Number} gossip
     * @param {Number} history
     *
     * @constructor
     */
    constructor (gossip, history) {
	/**
	 * @type {Map<string, RPC.Message>}
	 */
        this.msgs = new Map()
	this.history = new Array(history).fill(new CacheEntry()).map(() => new Array(history).fill(new CacheEntry()))
	this.gossip = gossip
    }

    /**
     * Adds a message to the current window and the cache
     * @note: I don't think this reproduce the same functionality as the Go
     * implementation at the moment.
     * @param {pb.rpc.RPC.Message}
     *
     */
    put (msg) {
	var msgID = utils.msgId(msg.from, msg.seqno)
	this.msgs[msgID] = msg
	this.history[0] = history[0].concat(new CacheEntry(msgID, msg.topicIDs))
    }

    /**
     * Retrieves a message from the cache by its ID, if it is still present
     *
     * @param {String}
     *
     */
    get (msgID) {
	var bool = this.msgs.has(msgID)
	var m = this.msgs.get(msgID)
	return [m, bool]
    }

    /**
     * Retrieves a list of message IDs for a given topic
     * 
     * @param {String}
     *
     */
    getGossipIDs (topic) {
    	var msgIDs = [];
	this.history.slice(0, this.gossip).forEach(function(entries) {
	    entries.forEach(function(entry){
	        entry.topics.forEach(function(t){
		    if(t === topic) {
		        msgIDs = msgIDs.concat(entry.msgID)
		    }
		})
	    })
	})

        return msgIDs;
    }

    /**
     * Shifts the current window, discarding messages older than the history
     * length of the cache.
     *
     */
    shift () {
        var last = this.history[this.history.length - 1]
	last.forEach(function(entry){
	    this.msgs.delete(entry.msgID)
	})

	this.history.shift()
    }
}

module.exports = {
    CacheEntry,
    MessageCache
}
