import { RPC } from './rpc.js';
export interface DecodeRPCLimits {
    maxSubscriptions: number;
    maxMessages: number;
    maxIhaveMessageIDs: number;
    maxIwantMessageIDs: number;
    maxControlMessages: number;
    maxPeerInfos: number;
}
export declare const defaultDecodeRpcLimits: DecodeRPCLimits;
/**
 * Copied code from src/message/rpc.ts but with decode limits to prevent OOM attacks
 */
export declare function decodeRpc(bytes: Uint8Array, opts: DecodeRPCLimits): RPC;
//# sourceMappingURL=decodeRpc.d.ts.map