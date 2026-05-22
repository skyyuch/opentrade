/**
 * Client-side Web3 provider stack for OpenTrade Console.
 *
 * Mirrors apps/web Web3Providers with two differences:
 *   1. Dark theme (console default per ADR-0011)
 *   2. Console-specific login methods (wallet + email for B2B)
 *
 * Per ADR-0005 + rule 40:
 *   - Privy handles social login + embedded wallet creation.
 *   - SmartWalletsProvider enables ERC-4337 AA + gasless tx via Paymaster.
 *   - WagmiProvider from `@privy-io/wagmi` syncs Privy connector state.
 *   - QueryClientProvider is required by wagmi v2's data layer.
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

export const Web3Providers = ({ children }: Props) => (
  <PrivyProvider
    appId={process.env['NEXT_PUBLIC_PRIVY_APP_ID'] ?? ''}
    config={{
      loginMethods: ['email', 'wallet', 'google'],
      appearance: { theme: 'dark', accentColor: '#3b82f6' },
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
