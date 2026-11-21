import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { Chess } from 'chess.js';
import { z } from 'zod';
import { pool } from './db.js';
import { adjustWallet, LedgerError, withWalletLock } from './ledger.js';
import { paymentAdapterFor, sandboxVerifyPattern } from './adapters/payment.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*' } });
const port = Number(process.env.BACKEND_PORT ?? 4000);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const accessSecretValue = process.env.JWT_ACCESS_SECRET;
const refreshSecretValue = process.env.JWT_REFRESH_SECRET;
if (!accessSecretValue || !refreshSecretValue) throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required');
const accessSecret: string = accessSecretValue;
const refreshSecret: string = refreshSecretValue;

interface AuthUser { id: string; role: 'user' | 'admin' }
type AuthedRequest = Request & { user?: AuthUser };

function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, accessSecret) as unknown as AuthUser;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

function admin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  return next();
}

const phoneSchema = z.string().regex(/^\+8801[3-9]\d{8}$/, 'Use Bangladesh phone format +8801XXXXXXXXX');
const registerSchema = z.object({
  phone: phoneSchema,
  email: z.string().email(),
  password: z.string().min(10).max(72)
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

app.get('/api/health', (_req, res) => res.json({ status: 'ok', mode: process.env.PAYMENT_MODE, market: process.env.MARKET_MODE, timeZone: 'Asia/Dhaka' }));

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const result = await pool.query(
      `INSERT INTO users (phone, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, phone, email, role`,
      [input.phone, input.email.toLowerCase(), passwordHash]
    );
    await pool.query('INSERT INTO wallets (user_id) VALUES ($1)', [result.rows[0].id]);
    res.status(201).json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await pool.query('SELECT id, password_hash, role FROM users WHERE email = $1', [input.email.toLowerCase()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) return res.status(401).json({ error: 'Invalid credentials' });
    const accessToken = jwt.sign({ id: user.id, role: user.role }, accessSecret, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user.id, role: user.role }, refreshSecret, { expiresIn: '7d' });
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await pool.query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [refreshHash, user.id]);
    res.json({ accessToken, refreshToken, user: { id: user.id, role: user.role } });
  } catch (error) { next(error); }
});

app.post('/api/auth/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    const payload = jwt.verify(refreshToken, refreshSecret) as AuthUser;
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const result = await pool.query('SELECT id, role FROM users WHERE id = $1 AND refresh_token_hash = $2', [payload.id, hash]);
    if (!result.rowCount) return res.status(401).json({ error: 'Refresh token revoked' });
    const accessToken = jwt.sign({ id: payload.id, role: payload.role }, accessSecret, { expiresIn: '15m' });
    res.json({ accessToken });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', auth, async (req: AuthedRequest, res) => {
  await pool.query('UPDATE users SET refresh_token_hash = NULL WHERE id = $1', [req.user?.id]);
  res.status(204).send();
});

app.get('/api/me', auth, async (req: AuthedRequest, res) => {
  const user = await pool.query('SELECT id, phone, email, role FROM users WHERE id = $1', [req.user?.id]);
  const wallet = await pool.query('SELECT balance_minor, currency FROM wallets WHERE user_id = $1', [req.user?.id]);
  res.json({ user: user.rows[0], wallet: wallet.rows[0] });
});

app.get('/api/wallet/ledger', auth, async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `SELECT l.* FROM ledger_transactions l JOIN wallets w ON w.id = l.wallet_id
     WHERE w.user_id = $1 ORDER BY l.created_at DESC LIMIT 100`, [req.user?.id]);
  res.json({ entries: result.rows });
});

app.post('/api/payments/deposits', auth, async (req: AuthedRequest, res, next) => {
  try {
    const input = z.object({ rail: z.enum(['BKASH', 'NAGAD']), amountMinor: z.coerce.bigint().positive(), idempotencyKey: z.string().min(8).max(128) }).parse(req.body);
    const adapter = paymentAdapterFor(input.rail);
    const intent = await adapter.createDepositIntent(input);
    const result = await pool.query(
      `INSERT INTO payment_requests (user_id, rail, direction, amount_minor, checkout_url, idempotency_key, metadata)
       VALUES ($1, $2, 'DEPOSIT', $3, $4, $5, $6) RETURNING *`,
      [req.user!.id, input.rail, input.amountMinor.toString(), intent.checkoutUrl, input.idempotencyKey, JSON.stringify({ providerReference: intent.providerReference })]
    );
    res.status(201).json({ payment: result.rows[0], sandbox: true });
  } catch (error) { next(error); }
});

app.post('/api/payments/deposits/:id/verify', auth, async (req: AuthedRequest, res, next) => {
  try {
    const { trxId } = z.object({ trxId: z.string().regex(sandboxVerifyPattern) }).parse(req.body);
    const result = await pool.query('SELECT * FROM payment_requests WHERE id = $1 AND user_id = $2 AND direction = $3 FOR UPDATE', [req.params.id, req.user!.id, 'DEPOSIT']);
    if (!result.rowCount) return res.status(404).json({ error: 'Deposit not found' });
    const payment = result.rows[0];
    if (payment.state === 'COMPLETED') return res.json({ payment, alreadyProcessed: true });
    const adapter = paymentAdapterFor(payment.rail);
    if (!(await adapter.verifyTransaction({ trxId, amountMinor: BigInt(payment.amount_minor), rail: payment.rail }))) return res.status(400).json({ error: 'Transaction verification failed' });
    await withWalletLock(req.user!.id, `deposit:${payment.id}:${trxId}`, async (client, walletId) => {
      await adjustWallet(client, walletId, BigInt(payment.amount_minor), 'CREDIT', `deposit:${payment.id}:${trxId}`, 'DEPOSIT', payment.id, { trxId, rail: payment.rail });
    });
    await pool.query("UPDATE payment_requests SET state = 'COMPLETED', trx_id = $1, updated_at = NOW() WHERE id = $2", [trxId, payment.id]);
    res.json({ payment: { ...payment, state: 'COMPLETED', trx_id: trxId } });
  } catch (error) { next(error); }
});

app.post('/api/payments/withdrawals', auth, async (req: AuthedRequest, res, next) => {
  try {
    const input = z.object({ rail: z.enum(['BKASH', 'NAGAD']), msisdn: phoneSchema, amountMinor: z.coerce.bigint().positive(), idempotencyKey: z.string().min(8).max(128) }).parse(req.body);
    const payment = await withWalletLock(req.user!.id, input.idempotencyKey, async (client, walletId, balance) => {
      if (balance < input.amountMinor) throw new LedgerError('Insufficient wallet balance');
      await adjustWallet(client, walletId, input.amountMinor, 'DEBIT', input.idempotencyKey, 'WITHDRAW_LOCK', undefined, { rail: input.rail, msisdn: input.msisdn, settlement: 'PENDING' });
      const created = await client.query(
        `INSERT INTO payment_requests (user_id, rail, direction, amount_minor, msisdn, state, idempotency_key)
         VALUES ($1, $2, 'WITHDRAW', $3, $4, 'PENDING', $5) RETURNING *`,
        [req.user!.id, input.rail, input.amountMinor.toString(), input.msisdn, input.idempotencyKey]
      );
      return created.rows[0];
    });
    res.status(201).json({ withdrawal: payment });
  } catch (error) { next(error); }
});

app.post('/api/admin/withdrawals/:id/approve', auth, admin, async (req: AuthedRequest, res, next) => {
  try {
    await pool.query("UPDATE payment_requests SET state = 'COMPLETED', updated_at = NOW() WHERE id = $1 AND direction = 'WITHDRAW'", [req.params.id]);
    res.json({ state: 'COMPLETED' });
  } catch (error) { next(error); }
});

app.post('/api/admin/withdrawals/:id/reject', auth, admin, async (req: AuthedRequest, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM payment_requests WHERE id = $1 AND direction = 'WITHDRAW' AND state = 'PENDING'", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Pending withdrawal not found' });
    const payment = result.rows[0];
    await withWalletLock(payment.user_id, `refund:${payment.id}`, async (client, walletId) => {
      await adjustWallet(client, walletId, BigInt(payment.amount_minor), 'CREDIT', `refund:${payment.id}`, 'WITHDRAW_REFUND', payment.id, { reason: 'Admin rejected withdrawal' });
    });
    await pool.query("UPDATE payment_requests SET state = 'REJECTED', updated_at = NOW() WHERE id = $1", [payment.id]);
    res.json({ state: 'REJECTED' });
  } catch (error) { next(error); }
});

app.get('/api/markets/prices', (_req, res) => res.json({
  USD_BDT: 122.45,
  EUR_USD: 1.084,
  XAU_BDT: 184750,
  XAU_USD: 2637.2,
  timeZone: 'Asia/Dhaka',
  mode: 'simulated'
}));

app.post('/api/trades/open', auth, async (req: AuthedRequest, res, next) => {
  try {
    const input = z.object({ symbol: z.enum(['USD/BDT', 'EUR/USD', 'XAU/BDT', 'XAU/USD']), side: z.enum(['BUY', 'SELL']), quantity: z.coerce.number().positive(), entryPrice: z.coerce.number().positive(), takeProfit: z.coerce.number().positive().optional(), stopLoss: z.coerce.number().positive().optional(), marginMinor: z.coerce.bigint().nonnegative(), idempotencyKey: z.string().min(8).max(128) }).parse(req.body);
    await withWalletLock(req.user!.id, input.idempotencyKey, async (client, walletId, balance) => {
      if (input.marginMinor > balance) throw new LedgerError('Insufficient margin balance');
      await adjustWallet(client, walletId, input.marginMinor, 'DEBIT', input.idempotencyKey, 'TRADE_MARGIN', undefined, { symbol: input.symbol });
      await client.query(`INSERT INTO trade_positions (user_id, symbol, side, quantity, entry_price, take_profit, stop_loss, margin_minor)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [req.user!.id, input.symbol, input.side, input.quantity, input.entryPrice, input.takeProfit ?? null, input.stopLoss ?? null, input.marginMinor.toString()]);
    });
    res.status(201).json({ position: 'OPEN', simulated: true });
  } catch (error) { next(error); }
});

app.post('/api/trades/:id/close', auth, async (req: AuthedRequest, res, next) => {
  try {
    const input = z.object({ closePrice: z.coerce.number().positive() }).parse(req.body);
    const position = await pool.query('SELECT * FROM trade_positions WHERE id = $1 AND user_id = $2 AND status = $3', [req.params.id, req.user!.id, 'OPEN']);
    if (!position.rowCount) return res.status(404).json({ error: 'Open position not found' });
    const trade = position.rows[0];
    const direction = trade.side === 'BUY' ? 1 : -1;
    const pnl = Math.round(Number(trade.quantity) * (input.closePrice - Number(trade.entry_price)) * direction * 100);
    await withWalletLock(req.user!.id, `close:${trade.id}`, async (client, walletId) => {
      await adjustWallet(client, walletId, BigInt(Math.max(0, Number(trade.margin_minor) + pnl)), 'CREDIT', `close:${trade.id}`, 'TRADE_SETTLEMENT', trade.id, { pnlMinor: pnl, closePrice: input.closePrice });
      await client.query("UPDATE trade_positions SET status = 'CLOSED', close_price = $1, pnl_minor = $2, closed_at = NOW() WHERE id = $3", [input.closePrice, pnl, trade.id]);
    });
    res.json({ closed: true, pnlMinor: pnl });
  } catch (error) { next(error); }
});

app.get('/api/games/provably-fair/commitment', (req, res) => {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  res.json({ commitment: crypto.createHash('sha256').update(serverSeed).digest('hex'), nonce: 0, serverSeedIsReleasedAfterRound: true });
});

app.post('/api/games/provably-fair/roll', (req, res, next) => {
  try {
    const input = z.object({ serverSeed: z.string().min(32), clientSeed: z.string().min(1), nonce: z.number().int().nonnegative(), game: z.enum(['CRASH', 'DICE', 'SPIN']) }).parse(req.body);
    const digest = crypto.createHash('sha256').update(`${input.serverSeed}:${input.clientSeed}:${input.nonce}`).digest('hex');
    const value = parseInt(digest.slice(0, 8), 16) / 0xffffffff;
    const crash = Math.max(1, Math.floor(100 * (0.99 / (1 - value))) / 100);
    res.json({ value, dice: Math.floor(value * 100), spin: Math.floor(value * 8), crash });
  } catch (error) { next(error); }
});

io.of('/ludo').on('connection', socket => {
  socket.on('room:join', room => socket.join(String(room)));
  socket.on('ludo:roll', room => io.of('/ludo').to(String(room)).emit('ludo:rolled', { value: 1 + Math.floor(Math.random() * 6), sandbox: true }));
});

const chessGames = new Map<string, Chess>();
io.of('/chess').on('connection', socket => {
  socket.on('match:join', ({ room }) => {
    socket.join(String(room));
    if (!chessGames.has(room)) chessGames.set(room, new Chess());
  });
  socket.on('move', ({ room, from, to, promotion }) => {
    const game = chessGames.get(room);
    if (!game) return socket.emit('move:error', { error: 'Match not found' });
    try {
      const move = game.move({ from, to, promotion });
      io.of('/chess').to(room).emit('move:applied', { move, fen: game.fen(), isGameOver: game.isGameOver() });
    } catch { socket.emit('move:error', { error: 'Illegal move' }); }
  });
});

io.of('/crash').on('connection', socket => {
  socket.on('round:bet', payload => socket.emit('round:accepted', { accepted: true, bet: payload.bet, mode: 'sandbox' }));
});

const marketSymbols = ['USD/BDT', 'EUR/USD', 'XAU/BDT', 'XAU/USD'];
setInterval(() => {
  io.of('/markets').emit('prices', Object.fromEntries(marketSymbols.map((symbol, index) => [symbol, 100 + index * 17 + Math.sin(Date.now() / 10000 + index) * 2])));
}, 1000);

io.of('/markets').on('connection', socket => socket.emit('prices', Object.fromEntries(marketSymbols.map((symbol, index) => [symbol, 100 + index * 17]))));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: error.flatten() });
  if (error instanceof LedgerError) return res.status(409).json({ error: error.message });
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return res.status(409).json({ error: 'Duplicate or already processed resource' });
  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
});

server.listen(port, '0.0.0.0', () => console.log(`Backend listening on ${port}; sandbox mode=${process.env.PAYMENT_MODE}`));
