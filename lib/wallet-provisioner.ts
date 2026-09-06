export interface WalletProvisioner {
  provisionEmbeddedWallet(userId: string): Promise<{ providerUserId?: string; walletId?: string } | null>;
}

export class NoopWalletProvisioner implements WalletProvisioner {
  async provisionEmbeddedWallet() {
    return null;
  }
}

export class PrivyWalletProvisioner implements WalletProvisioner {
  async provisionEmbeddedWallet(_userId: string): Promise<{ providerUserId?: string; walletId?: string } | null> {
    if (!process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET) {
      throw new Error("Privy is enabled but its credentials are not configured");
    }
    throw new Error("Privy adapter is reserved and intentionally disabled in Phase 0-7");
  }
}

export function walletProvisioner(): WalletProvisioner {
  return process.env.ENABLE_PRIVY_EMBEDDED_WALLET === "true"
    ? new PrivyWalletProvisioner()
    : new NoopWalletProvisioner();
}
