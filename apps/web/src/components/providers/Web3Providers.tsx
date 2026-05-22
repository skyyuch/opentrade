/**
 * Client-side Web3 provider stack for OpenTrade.
 *
 * Nesting order (outermost → innermost):
 *   PrivyProvider → SmartWalletsProvider → QueryClientProvider → WagmiProvider
 *
 * Per ADR-0005 + rule 40:
 *   - Privy handles social login + embedded wallet creation.
 *   - SmartWalletsProvider enables ERC-4337 AA + gasless tx via Paymaster.
 *   - WagmiProvider from `@privy-io/wagmi` (NOT `wagmi`) syncs Privy
 *     connector state into wagmi hooks.
 *   - QueryClientProvider is required by wagmi v2's data layer.
 *
 * This component MUST be a Client Component (`'use client'`) because Privy
 * renders iframes + modals. It lives inside NextIntlClientProvider so login
 * UI can access i18n translations.
 */

'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import { createConfig, WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http } from 'wagmi';

import { base, baseSepolia } from '@opentrade/config/chains';

import type { ReactNode } from 'react';

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [baseSepolia, base],
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
  },
});

type Props = {
  children: ReactNode;
};

/**
 * viem's chain definitions use `testnet?: boolean` which under our strict
 * `exactOptionalPropertyTypes: true` TSConfig becomes `boolean | undefined`.
 * Privy's PrivyClientConfig expects `Chain` where `testnet` is plain
 * `boolean`. Rather than fighting the type system with cascading casts, we
 * pass the config object directly to PrivyProvider whose props are wider
 * than the named PrivyClientConfig export.
 */
export const Web3Providers = ({ children }: Props) => (
  <PrivyProvider
    appId={process.env['NEXT_PUBLIC_PRIVY_APP_ID'] ?? ''}
    config={{
      loginMethods: ['google', 'apple', 'email', 'sms', 'wallet'],
      appearance: { theme: 'light', accentColor: '#1e40af' },
      embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
      defaultChain: baseSepolia,
      supportedChains: [baseSepolia, base] as never,
    }}
  >
    <SmartWalletsProvider>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </SmartWalletsProvider>
  </PrivyProvider>
);
