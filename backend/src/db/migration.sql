DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(14) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  refresh_token_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'BDT',
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  CREATE TYPE ledger_state AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  counter_wallet_id UUID REFERENCES wallets(id),
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  type VARCHAR(32) NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  state ledger_state NOT NULL DEFAULT 'PENDING',
  reference_type VARCHAR(32),
  reference_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  rail VARCHAR(16) NOT NULL CHECK (rail IN ('BKASH', 'NAGAD')),
  direction VARCHAR(16) NOT NULL CHECK (direction IN ('DEPOSIT', 'WITHDRAW')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  msisdn VARCHAR(14),
  trx_id VARCHAR(128),
  checkout_url TEXT,
  state ledger_state NOT NULL DEFAULT 'PENDING',
  idempotency_key VARCHAR(128) UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  players JSONB NOT NULL DEFAULT '[]',
  state JSONB NOT NULL DEFAULT '{}',
  entry_fee_minor BIGINT NOT NULL DEFAULT 0,
  pot_minor BIGINT NOT NULL DEFAULT 0,
  winner_id UUID REFERENCES users(id),
  settlement_idempotency_key VARCHAR(128) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trade_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  symbol VARCHAR(16) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity NUMERIC(18,8) NOT NULL CHECK (quantity > 0),
  entry_price NUMERIC(18,8) NOT NULL CHECK (entry_price > 0),
  take_profit NUMERIC(18,8),
  stop_loss NUMERIC(18,8),
  margin_minor BIGINT NOT NULL CHECK (margin_minor >= 0),
  pnl_minor BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'LIQUIDATED')),
  close_price NUMERIC(18,8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON ledger_transactions(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_user ON payment_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_open ON trade_positions(status, symbol);
