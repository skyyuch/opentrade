/**
 * Pinata adapter for IIpfsService.
 *
 * Uses the official Pinata SDK v2 to pin JSON payloads to the public IPFS
 * network. The CID returned by Pinata is the content-addressed identifier
 * that the ReviewRegistry contract stores on-chain.
 *
 * Per rule 50: the Pinata JWT is loaded from env (never hardcoded).
 * Per ADR-0019 D1: only the content hash goes on-chain; full content on IPFS.
 */

import { PinataSDK } from 'pinata';

import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import type { IIpfsService, IpfsPinResult } from './IIpfsService.js';

export class PinataIpfsService implements IIpfsService {
  private readonly pinata: PinataSDK;

  constructor(pinataJwt: string) {
    this.pinata = new PinataSDK({ pinataJwt });
  }

  async pinJson(data: unknown, name: string): Promise<IpfsPinResult> {
    try {
      const result = await this.pinata.upload.public.json(data as object).name(name);
      return { cid: result.cid };
    } catch (error) {
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Failed to pin review to IPFS via Pinata',
        503,
        { cause: error },
      );
    }
  }

  async pinFile(file: File, name: string): Promise<IpfsPinResult> {
    try {
      const result = await this.pinata.upload.public.file(file).name(name);
      return { cid: result.cid };
    } catch (error) {
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Failed to pin file to IPFS via Pinata',
        503,
        { cause: error },
      );
    }
  }
}
