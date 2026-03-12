import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import * as sdk from "@erc-mandated/sdk";

export type RuntimeAccount = ReturnType<typeof privateKeyToAccount>;

export function getRuntimeAccountFromEnv(envKeys: readonly string[]): RuntimeAccount | undefined {
  for (const envKey of envKeys) {
    const privateKey = process.env[envKey];

    if (privateKey) {
      return privateKeyToAccount(privateKey as Hex);
    }
  }

  return undefined;
}

export function createRuntimeExecutionAdapter(chainId: number, account: RuntimeAccount) {
  const chain = sdk.getChainConfig(chainId).viemChain;
  const transport = http(sdk.getRpcUrl(chainId));
  const walletClient = createWalletClient({
    account,
    chain,
    transport
  });
  const publicClient = createPublicClient({
    chain,
    transport
  });

  return {
    async getAddress() {
      return account.address;
    },
    async sendTransaction(parameters: {
      txRequest: {
        from: `0x${string}`;
        to: `0x${string}`;
        data: `0x${string}`;
        value: "0";
      };
    }) {
      return walletClient.sendTransaction({
        account,
        chain,
        to: parameters.txRequest.to,
        data: parameters.txRequest.data,
        value: BigInt(parameters.txRequest.value)
      });
    },
    async waitForTransactionReceipt(parameters: {
      txHash: `0x${string}`;
      confirmations?: number;
      timeoutMs?: number;
      pollIntervalMs?: number;
    }) {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: parameters.txHash,
          confirmations: parameters.confirmations,
          timeout: parameters.timeoutMs,
          pollingInterval: parameters.pollIntervalMs
        });

        return {
          status: receipt.status === "success" ? ("success" as const) : ("reverted" as const),
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          receipt
        };
      } catch (error: unknown) {
        const errorName = error instanceof Error ? error.name : String(error);
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (
          errorName.includes("WaitForTransactionReceiptTimeoutError") ||
          errorMessage.includes("timed out")
        ) {
          return {
            status: "timeout" as const
          };
        }

        throw error;
      }
    }
  };
}
