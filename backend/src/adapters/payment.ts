import crypto from 'node:crypto';

export type PaymentRail = 'BKASH' | 'NAGAD';
export interface PaymentIntent {
  checkoutUrl: string;
  providerReference: string;
}

export interface PaymentAdapter {
  createDepositIntent(params: { amountMinor: bigint; rail: PaymentRail }): Promise<PaymentIntent>;
  verifyTransaction(params: { trxId: string; amountMinor: bigint; rail: PaymentRail }): Promise<boolean>;
}

class SandboxAdapter implements PaymentAdapter {
  async createDepositIntent({ amountMinor, rail }: { amountMinor: bigint; rail: PaymentRail }) {
    const providerReference = `${rail}-SBX-${crypto.randomBytes(6).toString('hex').toUpperCase()} `;
    const checkoutUrl = `/sandbox-checkout?rail=${rail}&amount=${amountMinor.toString()}&ref=${encodeURIComponent(providerReference.trim())}`;
    return { checkoutUrl, providerReference: providerReference.trim() };
  }

  async verifyTransaction({ trxId, rail }: { trxId: string; amountMinor: bigint; rail: PaymentRail }) {
    return /^SBX-[A-Z0-Z2-7-]+$/.test(trxId) && Boolean(rail);
  }
}

export function paymentAdapterFor(rail: PaymentRail): PaymentAdapter {
  if (process.env.PAYMENT_MODE !== 'sandbox') {
    throw new Error(`Real ${rail} adapter is not configured. Set valid merchant credentials and review live compliance controls.`);
  }
  return new SandboxAdapter();
}

export const sandboxVerifyPattern = /^SBX-[A-Z0-9-]+$/;
