import crypto from 'node:crypto';
import { itBench, setBenchOpts } from '@dapplion/benchmark';
import { RPC } from '../../src/message/rpc.js';
describe('protobuf', function () {
    this.timeout(0);
    setBenchOpts({
        maxMs: 200 * 1000,
        minMs: 60 * 1000
    });
    const testCases = [
        // As of Oct 2023, Attestation length = 281
        { name: 'Attestation', length: 300 },
        // A SignedBeaconBlock could be from 70_000 to 300_000
        { name: 'SignedBeaconBlock', length: 70000 },
        { name: 'SignedBeaconBlock', length: 140000 },
        { name: 'SignedBeaconBlock', length: 210000 },
        { name: 'SignedBeaconBlock', length: 280000 }
    ];
    for (const { name, length } of testCases) {
        const rpc = {
            subscriptions: [],
            messages: [
                {
                    topic: 'topic1',
                    data: crypto.randomBytes(length),
                    signature: Uint8Array.from(Array.from({ length: 96 }, () => 100))
                }
            ],
            control: undefined
        };
        const bytes = RPC.encode(rpc);
        const runsFactor = 1000;
        itBench({
            id: `decode ${name} message ${length} bytes`,
            fn: () => {
                for (let i = 0; i < runsFactor; i++) {
                    RPC.decode(bytes);
                }
            },
            runsFactor
        });
        itBench({
            id: `encode ${name} message ${length} bytes`,
            fn: () => {
                for (let i = 0; i < runsFactor; i++) {
                    RPC.encode(rpc);
                }
            },
            runsFactor
        });
    }
});
//# sourceMappingURL=protobuf.test.js.map