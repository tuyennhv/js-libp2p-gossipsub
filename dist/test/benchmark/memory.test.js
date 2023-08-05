import { decodeRpc, defaultDecodeRpcLimits } from '../../src/message/decodeRpc.js';
import { RPC } from '../../src/message/rpc.js';
const message = {
    topic: 'topic1',
    // typical Attestation
    data: Buffer.from('e40000000a000000000000000a00000000000000a45c8daa336e17a150300afd4c717313c84f291754c51a378f20958083c5fa070a00000000000000a45c8daa336e17a150300afd4c717313c84f291754c51a378f20958083c5fa070a00000000000000a45c8daa336e17a150300afd4c717313c84f291754c51a378f20958083c5fa0795d2ef8ae4e2b4d1e5b3d5ce47b518e3db2c8c4d082e4498805ac2a686c69f248761b78437db2927470c1e77ede9c18606110faacbcbe4f13052bde7f7eff6aab09edf7bc4929fda2230f943aba2c47b6f940d350cb20c76fad4a8d40e2f3f1f01', 'hex'),
    signature: Uint8Array.from(Array.from({ length: 96 }, () => 100))
};
const rpc = {
    subscriptions: [],
    messages: Array.from({ length: 10 }, () => message),
    control: {
        ihave: [
            {
                topicID: 'topic1',
                messageIDs: Array.from({ length: 100 }, () => Uint8Array.from(Array.from({ length: 32 }, () => 100)))
            }
        ],
        iwant: [],
        graft: [],
        prune: []
    }
};
const bytes = RPC.encode(rpc);
const count = 1000;
const rss = process.memoryUsage().rss;
for (let i = 0; i < count; i++) {
    for (let j = 0; j < 1e7; j++) {
        // RPC.decode(bytes)
        decodeRpc(bytes, defaultDecodeRpcLimits);
    }
    console.log('@@@ i =', i, 'new rss', formatBytes(process.memoryUsage().rss - rss));
}
function formatBytes(bytes) {
    const kb = 1024;
    const mb = kb * 1024;
    const gb = mb * 1024;
    if (bytes < kb) {
        return `${bytes} B`;
    }
    else if (bytes < mb) {
        return `${(bytes / kb).toFixed(2)} KB`;
    }
    else if (bytes < gb) {
        return `${(bytes / mb).toFixed(2)} MB`;
    }
    else {
        return `${(bytes / gb).toFixed(2)} GB`;
    }
}
console.log('@@@ done');
//# sourceMappingURL=memory.test.js.map