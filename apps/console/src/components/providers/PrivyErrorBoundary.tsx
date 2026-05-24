/**
 * Error boundary that catches Privy SDK initialization failures.
 *
 * When Privy fails (network, invalid app ID, SDK bug), this boundary
 * renders children WITHOUT the Privy context. Components that call
 * usePrivy() must be wrapped separately and handle the fallback.
 */

'use client';

import { Component } from 'react';

import type { ErrorInfo, ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallback: ReactNode;
};

type State = {
  hasError: boolean;
};

export class PrivyErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(
      '[PrivyErrorBoundary] Privy SDK error caught:',
      error.message,
      info.componentStack,
    );
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
