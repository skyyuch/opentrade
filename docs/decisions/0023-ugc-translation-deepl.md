# ADR-0023: UGC Translation via DeepL API (Phase 1)

## Status

Accepted

## Date

2026-05-22

## Context

OpenTrade targets three language communities: Traditional Chinese (zh-Hant), Simplified Chinese (zh-Hans), and English (en). User-generated content (reviews) is written in one language but must be accessible to all three communities.

Per ADR-0003, the platform uses next-intl for static UI translations. UGC requires a different approach: machine translation at submission time, stored alongside the original for instant serving.

## Decision

### D1: DeepL API for machine translation

Use DeepL's REST API (server-side only) to translate review title and body into the two non-source locales at submission time.

### D2: ReviewTranslation model

Store translations in a separate table (`review_translations`) with FK to Review, keyed by locale. Original content stays in the Review row; translations are siblings.

### D3: Synchronous on-submit (Phase 1)

Translations happen synchronously during review submission (SubmitReviewUseCase). Phase 2 moves to async (SQS queue) for better latency.

### D4: Source locale detection

DeepL auto-detects source language. The detected locale is stored in `Review.sourceLocale`.

### D5: API serves by Accept-Language

`GET /v1/reviews/broker/:slug` reads the `Accept-Language` header and returns translated content when available, falling back to original.

## Alternatives Considered

- **Google Cloud Translation**: Comparable quality but more complex auth setup (service account). DeepL is simpler for Phase 1 and has excellent zh-Hant support.
- **OpenAI GPT translation**: Higher cost per token, less consistent for CJK languages.
- **No translation (user's problem)**: Defeats the multi-language value proposition.

## Consequences

### Positive

- Reviews instantly accessible in all three languages
- Clean separation: original content immutable, translations additive
- "Machine translated" badge maintains transparency

### Negative / Trade-offs

- DeepL API cost (~$20/million chars, well within Phase 1 budget)
- Synchronous translation adds ~500ms latency to review submission
- Translation quality is not human-reviewed

## Implementation Notes

- New Prisma model: `ReviewTranslation`
- Review model gains `sourceLocale` field
- New env var: `DEEPL_API_KEY`
- Translation service: `apps/api/src/domains/reviews/infrastructure/DeepLTranslationService.ts`

## References

- ADR-0003: i18n three-language architecture
- DeepL API docs: https://www.deepl.com/docs-api
