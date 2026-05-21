/**
 * Port for IPFS pinning operations.
 *
 * The reviews domain needs to pin the full review JSON to IPFS before
 * submitting the content hash on-chain. Infrastructure adapters implement
 * this with the Pinata SDK; tests can inject a stub that returns a fixed CID.
 */

export type IpfsPinResult = {
  cid: string;
};

export type IIpfsService = {
  pinJson(data: unknown, name: string): Promise<IpfsPinResult>;
};
