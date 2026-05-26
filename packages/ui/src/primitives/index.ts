/**
 * Primitives — shadcn-style atomic components, wrapped in OpenTrade design
 * tokens. Each primitive belongs in its own folder with a `.tsx` file and a
 * `.stories.tsx` file (per ADR-0009).
 */

export { Button, buttonVariants, type ButtonProps } from './button/Button';

export {
  EvidenceUpload,
  type EvidenceUploadFile,
  type EvidenceUploadLabels,
  type EvidenceUploadProps,
} from './evidence-upload/EvidenceUpload';

export { SentimentBadge, type SentimentBadgeProps } from './sentiment-badge/SentimentBadge';

export {
  SentimentPicker,
  type Sentiment,
  type SentimentPickerLabels,
  type SentimentPickerProps,
} from './sentiment-picker/SentimentPicker';
