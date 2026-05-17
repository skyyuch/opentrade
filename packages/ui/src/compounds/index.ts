/**
 * Compounds — OpenTrade business components (ReviewCard, SBTBadge,
 * ImmutableMark, KOLSignalChart, …). Compose primitives and apply business
 * semantics, but stay pure-presentational (no API calls, no state beyond
 * local UI per ADR-0009).
 */

export {
  ImmutableMark,
  type ImmutableMarkProps,
  type ImmutableMarkChain,
} from './immutable-mark/ImmutableMark';
