/**
 * Application layer: serve a review's IPFS-pinned payload via the API
 * with an explicit `Content-Type: application/json; charset=utf-8`.
 *
 * Why this exists:
 *   The Pinata public gateway returns the raw JSON bytes correctly
 *   (UTF-8 on the wire) but does **not** send a `charset=utf-8`
 *   parameter in the Content-Type header. Browsers that hit the
 *   gateway URL directly fall back to Latin-1 and render CJK content
 *   (e.g. "app不好用") as garbled mojibake ("app ä¸å¥½ç"¨"). The
 *   issue was reproduced + diagnosed during the 2026-05-24 E2E and
 *   recorded in conversations/2026-05-24-translation-deprecation-and-e2e.md.
 *
 *   Pinning the content again via a "fix the JSON" pipeline would
 *   violate immutability (the contentHash on-chain would diverge from
 *   the new IPFS CID). The right answer is a thin read-side proxy
 *   that fetches the bytes once and re-emits them with the correct
 *   header. The contentHash is unchanged; only the HTTP envelope
 *   differs.
 *
 * Per rule 30 (DDD): this is a pure application service. It depends
 * on the repository port and a `fetch`-compatible function so the
 * commit's unit test (added in M6) can inject a mocked transport
 * without an outbound network call.
 *
 * Per rule 50: the gateway URL itself is loaded from env (never
 * hardcoded), so we can swap to a dedicated Pinata gateway without
 * a code change.
 */

import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import type { IReviewRepository } from '../domain/IReviewRepository.js';

export type IpfsContentResult = {
  /** Decoded UTF-8 string body of the IPFS-pinned JSON payload. */
  content: string;
  /** Canonical Content-Type header to ship back to the client. */
  contentType: string;
};

export type GetReviewIpfsContentInput = {
  reviewId: string;
};

type Fetcher = typeof fetch;

export class GetReviewIpfsContentUseCase {
  constructor(
    private readonly reviewRepo: IReviewRepository,
    private readonly gatewayBaseUrl: string,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async execute(input: GetReviewIpfsContentInput): Promise<IpfsContentResult | null> {
    const review = await this.reviewRepo.findById(input.reviewId);
    if (!review || !review.ipfsCid) {
      return null;
    }

    const url = `${this.gatewayBaseUrl}${review.ipfsCid}`;

    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        `IPFS gateway returned ${response.status}`,
        502,
      );
    }

    const buffer = await response.arrayBuffer();
    const content = new TextDecoder('utf-8').decode(buffer);

    return {
      content,
      contentType: 'application/json; charset=utf-8',
    };
  }
}
