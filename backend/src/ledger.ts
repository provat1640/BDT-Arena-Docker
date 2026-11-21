import type { PoolClient } from 'pg';
import { pool } from './db.js';

export class LedgerError extends Error {}

export async function withWalletLock<T>(
  userId: string,
  idempotencyKey: string,
  operation: (client: PoolClient, walletId: string, balanceMinor: bigint) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id FROM ledger_transactions WHERE idempotency_key = $1 LIMIT 1',
      [idempotencyKey]
    );
    if (existing.rowCount) {
      await client.query('ROLLBACK');
      throw new LedgerError('This operation was already processed');
    }

    const result = await client.query(
      'SELECT id, balance_minor FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (!result.rowCount) throw new LedgerError('Wallet not found');

    const walletId = result.rows[0].id as string;
    const balanceMinor = BigInt(result.rows[0].balance_minor);
    const value = await operation(client, walletId, balanceMinor);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function adjustWallet(
  client: PoolClient,
  walletId: string,
  amountMinor: bigint,
  operation: 'CREDIT' | 'DEBIT',
  idempotencyKey: string,
  type: string,
  referenceId?: string,
  metadata: object = {}
) {
  const wallet = await client.query(
    'SELECT balance_minor FROM wallets WHERE id = $1 FOR UPDATE',
    [walletId]
  );
  let balance = BigInt(wallet.rows[0].balance_minor);
  if (operation === 'DEBIT') {
    if (balance < amountMinor) throw new LedgerError('Insufficient wallet balance');
    balance -= amountMinor;
  } else {
    balance += amountMinor;
  }

  await client.query(
    'UPDATE wallets SET balance_minor = $1, version = version + 1, updated_at = NOW() WHERE id = $2',
    [balance.toString(), walletId]
  );
  await client.query(
    `INSERT INTO ledger_transactions
      (wallet_id, idempotency_key, type, amount_minor, state, reference_id, metadata, settled_at)
     VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6, NOW())`,
    [walletId, idempotencyKey, type, amountMinor.toString(), referenceId ?? null, JSON.stringify(metadata)]
  );
}
