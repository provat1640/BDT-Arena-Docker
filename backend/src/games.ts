import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pool } from './db.js';
import { adjustWallet, LedgerError, withWalletLock } from './ledger.js';

interface AuthUser { id: string; role: 'user' | 'admin' }
type AuthedRequest = Request & { user?: AuthUser };

const router = Router();

// ─── Provably fair engine helper ──────────────────────────────
function provablyFairRoll(serverSeed: string, clientSeed: string, nonce: number) {
  const digest = crypto.createHash('sha256')
    .update(`${serverSeed}:${clientSeed}:${nonce}`)
    .digest('hex');
  const value = parseInt(digest.slice(0, 8), 16) / 0xffffffff;
  return {
    value,
    dice: Math.floor(value * 100),
    spin: Math.floor(value * 8),
    crash: Math.max(1, Math.floor(100 * (0.99 / (1 - value))) / 100)
  };
}

// ─── XP calculation ──────────────────────────────
function calcXP(betMinor: bigint, won: boolean): number {
  const baseXP = Math.max(5, Math.floor(Number(betMinor) / 10000)); // 1 XP per ৳100 bet
  return won ? baseXP * 3 : baseXP;
}

function calcLevel(xp: number): number {
  // Level formula: level = floor(sqrt(xp / 100)) + 1
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

// ─── Award XP and update scores ──────────────────────────────
async function recordGameResult(
  userId: string, game: string, betMinor: bigint, payoutMinor: bigint,
  multiplier: number, result: object, won: boolean
) {
  const xpEarned = calcXP(betMinor, won);

  // Record game result
  await pool.query(
    `INSERT INTO game_results (user_id, game, bet_minor, payout_minor, multiplier, result, xp_earned)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, game, betMinor.toString(), payoutMinor.toString(), multiplier, JSON.stringify(result), xpEarned]
  );

  // Upsert user score
  const scoreResult = await pool.query(
    `INSERT INTO user_scores (user_id, xp, total_games, total_wins, current_streak, best_streak, updated_at)
     VALUES ($1, $2, 1, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       xp = user_scores.xp + $2,
       level = GREATEST(user_scores.level, $6),
       total_games = user_scores.total_games + 1,
       total_wins = user_scores.total_wins + $3,
       current_streak = $4,
       best_streak = GREATEST(user_scores.best_streak, $5),
       updated_at = NOW()
     RETURNING xp, current_streak, best_streak`,
    [
      userId, xpEarned, won ? 1 : 0,
      won ? 1 : 0, // current_streak for new row
      won ? 1 : 0, // best_streak for new row
      calcLevel(xpEarned) // level for new row
    ]
  );

  // If existing row, calculate streak correctly
  if (scoreResult.rows[0]) {
    const currentXP = Number(scoreResult.rows[0].xp);
    const newLevel = calcLevel(currentXP);
    // Recalculate streak from previous state
    const prevScore = await pool.query(
      'SELECT current_streak, best_streak FROM user_scores WHERE user_id = $1',
      [userId]
    );
    if (prevScore.rows[0]) {
      const prevStreak = Number(prevScore.rows[0].current_streak);
      const newStreak = won ? prevStreak + 1 : 0;
      const bestStreak = Math.max(Number(prevScore.rows[0].best_streak), newStreak);
      await pool.query(
        'UPDATE user_scores SET level = $1, current_streak = $2, best_streak = $3 WHERE user_id = $4',
        [newLevel, newStreak, bestStreak, userId]
      );
    }
  }

  // Update daily goals
  await pool.query(
    `INSERT INTO daily_goals (user_id, goal_date, games_played, games_won, different_games, total_wagered)
     VALUES ($1, CURRENT_DATE, 1, $2, $3, $4)
     ON CONFLICT (user_id, goal_date) DO UPDATE SET
       games_played = daily_goals.games_played + 1,
       games_won = daily_goals.games_won + $2,
       different_games = (
         SELECT jsonb_agg(DISTINCT val)
         FROM jsonb_array_elements_text(daily_goals.different_games || $3) AS val
       ),
       total_wagered = daily_goals.total_wagered + $4`,
    [userId, won ? 1 : 0, JSON.stringify([game]), betMinor.toString()]
  );

  // Check achievements
  await checkAchievements(userId);

  return xpEarned;
}

async function checkAchievements(userId: string) {
  const score = await pool.query('SELECT * FROM user_scores WHERE user_id = $1', [userId]);
  if (!score.rows[0]) return;
  const s = score.rows[0];

  const checks: [string, boolean][] = [
    ['first_win', s.total_wins >= 1],
    ['ten_games', s.total_games >= 10],
    ['streak_3', s.best_streak >= 3],
    ['fifty_games', s.total_games >= 50],
    ['streak_5', s.best_streak >= 5],
    ['level_5', s.level >= 5],
    ['level_10', s.level >= 10],
  ];

  // Check try_all
  const gamesPlayed = await pool.query(
    'SELECT DISTINCT game FROM game_results WHERE user_id = $1',
    [userId]
  );
  const uniqueGames = gamesPlayed.rows.map((r: any) => r.game);
  if (uniqueGames.includes('DICE') && uniqueGames.includes('CRASH') && uniqueGames.includes('SPIN')) {
    checks.push(['try_all', true]);
  }

  // Check high roller
  const highBet = await pool.query(
    'SELECT MAX(bet_minor) as max_bet FROM game_results WHERE user_id = $1',
    [userId]
  );
  if (highBet.rows[0] && Number(highBet.rows[0].max_bet) >= 500000) {
    checks.push(['high_roller', true]);
  }

  for (const [slug, earned] of checks) {
    if (!earned) continue;
    try {
      await pool.query(
        `INSERT INTO user_achievements (user_id, achievement_id)
         SELECT $1, id FROM achievements WHERE slug = $2
         ON CONFLICT DO NOTHING`,
        [userId, slug]
      );
      // Award XP for newly earned achievement
      const achResult = await pool.query(
        'SELECT xp_reward FROM achievements WHERE slug = $1', [slug]
      );
      if (achResult.rows[0]) {
        await pool.query(
          'UPDATE user_scores SET xp = xp + $1, updated_at = NOW() WHERE user_id = $2',
          [achResult.rows[0].xp_reward, userId]
        );
      }
    } catch { /* already earned, skip */ }
  }
}

// ─── DICE GAME ──────────────────────────────
const diceSchema = z.object({
  betMinor: z.coerce.bigint().positive(),
  target: z.number().int().min(1).max(98),
  direction: z.enum(['OVER', 'UNDER']),
  clientSeed: z.string().min(1).optional()
});

router.post('/dice/play', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const input = diceSchema.parse(req.body);
    const clientSeed = input.clientSeed ?? crypto.randomBytes(8).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const nonce = Date.now();
    const roll = provablyFairRoll(serverSeed, clientSeed, nonce);

    const won = input.direction === 'OVER'
      ? roll.dice > input.target
      : roll.dice < input.target;

    // Calculate multiplier based on probability
    const probability = input.direction === 'OVER'
      ? (99 - input.target) / 100
      : input.target / 100;
    const multiplier = won ? Math.floor((0.98 / probability) * 100) / 100 : 0;
    const payoutMinor = won ? BigInt(Math.floor(Number(input.betMinor) * multiplier)) : 0n;
    const idempKey = `dice:${userId}:${nonce}`;

    await withWalletLock(userId, idempKey, async (client, walletId, balance) => {
      if (balance < input.betMinor) throw new LedgerError('Insufficient balance');
      await adjustWallet(client, walletId, input.betMinor, 'DEBIT', `${idempKey}:bet`, 'GAME_BET', undefined, { game: 'DICE' });
      if (payoutMinor > 0n) {
        await adjustWallet(client, walletId, payoutMinor, 'CREDIT', `${idempKey}:win`, 'GAME_WIN', undefined, { game: 'DICE', multiplier });
      }
    });

    const xpEarned = await recordGameResult(
      userId, 'DICE', input.betMinor, payoutMinor,
      multiplier, { dice: roll.dice, target: input.target, direction: input.direction },
      won
    );

    res.json({
      won,
      dice: roll.dice,
      target: input.target,
      direction: input.direction,
      multiplier,
      betMinor: input.betMinor.toString(),
      payoutMinor: payoutMinor.toString(),
      xpEarned,
      provablyFair: {
        serverSeed,
        clientSeed,
        nonce,
        commitment: crypto.createHash('sha256').update(serverSeed).digest('hex')
      }
    });
  } catch (error) { next(error); }
});

// ─── CRASH GAME ──────────────────────────────
const crashSchema = z.object({
  betMinor: z.coerce.bigint().positive(),
  cashOutAt: z.number().min(1.01).max(1000),
  clientSeed: z.string().min(1).optional()
});

router.post('/crash/play', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const input = crashSchema.parse(req.body);
    const clientSeed = input.clientSeed ?? crypto.randomBytes(8).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const nonce = Date.now();
    const roll = provablyFairRoll(serverSeed, clientSeed, nonce);

    const crashPoint = roll.crash;
    const won = input.cashOutAt <= crashPoint;
    const multiplier = won ? input.cashOutAt : 0;
    const payoutMinor = won ? BigInt(Math.floor(Number(input.betMinor) * multiplier)) : 0n;
    const idempKey = `crash:${userId}:${nonce}`;

    await withWalletLock(userId, idempKey, async (client, walletId, balance) => {
      if (balance < input.betMinor) throw new LedgerError('Insufficient balance');
      await adjustWallet(client, walletId, input.betMinor, 'DEBIT', `${idempKey}:bet`, 'GAME_BET', undefined, { game: 'CRASH' });
      if (payoutMinor > 0n) {
        await adjustWallet(client, walletId, payoutMinor, 'CREDIT', `${idempKey}:win`, 'GAME_WIN', undefined, { game: 'CRASH', multiplier });
      }
    });

    const xpEarned = await recordGameResult(
      userId, 'CRASH', input.betMinor, payoutMinor,
      multiplier, { crashPoint, cashOutAt: input.cashOutAt },
      won
    );

    res.json({
      won,
      crashPoint,
      cashOutAt: input.cashOutAt,
      multiplier,
      betMinor: input.betMinor.toString(),
      payoutMinor: payoutMinor.toString(),
      xpEarned,
      provablyFair: {
        serverSeed,
        clientSeed,
        nonce,
        commitment: crypto.createHash('sha256').update(serverSeed).digest('hex')
      }
    });
  } catch (error) { next(error); }
});

// ─── SPIN GAME ──────────────────────────────
const SPIN_SEGMENTS = [
  { index: 0, label: '2x',  multiplier: 2,   color: '#ef4444' },
  { index: 1, label: '1.5x',multiplier: 1.5, color: '#f97316' },
  { index: 2, label: '3x',  multiplier: 3,   color: '#eab308' },
  { index: 3, label: '0x',  multiplier: 0,   color: '#6b7280' },
  { index: 4, label: '1.2x',multiplier: 1.2, color: '#22c55e' },
  { index: 5, label: '5x',  multiplier: 5,   color: '#3b82f6' },
  { index: 6, label: '0.5x',multiplier: 0.5, color: '#8b5cf6' },
  { index: 7, label: '10x', multiplier: 10,  color: '#ec4899' }
];

const spinSchema = z.object({
  betMinor: z.coerce.bigint().positive(),
  clientSeed: z.string().min(1).optional()
});

router.post('/spin/play', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const input = spinSchema.parse(req.body);
    const clientSeed = input.clientSeed ?? crypto.randomBytes(8).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const nonce = Date.now();
    const roll = provablyFairRoll(serverSeed, clientSeed, nonce);

    const segment = SPIN_SEGMENTS[roll.spin];
    const multiplier = segment.multiplier;
    const won = multiplier > 1;
    const payoutMinor = BigInt(Math.floor(Number(input.betMinor) * multiplier));
    const idempKey = `spin:${userId}:${nonce}`;

    await withWalletLock(userId, idempKey, async (client, walletId, balance) => {
      if (balance < input.betMinor) throw new LedgerError('Insufficient balance');
      await adjustWallet(client, walletId, input.betMinor, 'DEBIT', `${idempKey}:bet`, 'GAME_BET', undefined, { game: 'SPIN' });
      if (payoutMinor > 0n) {
        await adjustWallet(client, walletId, payoutMinor, 'CREDIT', `${idempKey}:win`, 'GAME_WIN', undefined, { game: 'SPIN', multiplier });
      }
    });

    const xpEarned = await recordGameResult(
      userId, 'SPIN', input.betMinor, payoutMinor,
      multiplier, { segment: roll.spin, label: segment.label },
      won
    );

    res.json({
      won,
      segment: roll.spin,
      segmentLabel: segment.label,
      segmentColor: segment.color,
      multiplier,
      betMinor: input.betMinor.toString(),
      payoutMinor: payoutMinor.toString(),
      xpEarned,
      segments: SPIN_SEGMENTS,
      provablyFair: {
        serverSeed,
        clientSeed,
        nonce,
        commitment: crypto.createHash('sha256').update(serverSeed).digest('hex')
      }
    });
  } catch (error) { next(error); }
});

// ─── SCORES & LEADERBOARD ──────────────────────────────
router.get('/scores/me', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const score = await pool.query(
      'SELECT * FROM user_scores WHERE user_id = $1', [userId]
    );
    if (!score.rows[0]) {
      return res.json({
        xp: 0, level: 1, totalGames: 0, totalWins: 0,
        currentStreak: 0, bestStreak: 0, winRate: 0
      });
    }
    const s = score.rows[0];
    res.json({
      xp: Number(s.xp),
      level: s.level,
      totalGames: s.total_games,
      totalWins: s.total_wins,
      currentStreak: s.current_streak,
      bestStreak: s.best_streak,
      winRate: s.total_games > 0 ? Math.round((s.total_wins / s.total_games) * 100) : 0
    });
  } catch (error) { next(error); }
});

router.get('/scores/leaderboard', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT u.email, s.xp, s.level, s.total_games, s.total_wins, s.best_streak
       FROM user_scores s JOIN users u ON u.id = s.user_id
       ORDER BY s.xp DESC LIMIT 10`
    );
    res.json({
      leaderboard: result.rows.map((r: any, i: number) => ({
        rank: i + 1,
        name: r.email.split('@')[0],
        xp: Number(r.xp),
        level: r.level,
        totalGames: r.total_games,
        totalWins: r.total_wins,
        bestStreak: r.best_streak
      }))
    });
  } catch (error) { next(error); }
});

// ─── ACHIEVEMENTS ──────────────────────────────
router.get('/achievements', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const all = await pool.query('SELECT * FROM achievements ORDER BY xp_reward ASC');
    const earned = await pool.query(
      'SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = $1',
      [userId]
    );
    const earnedMap = new Map(earned.rows.map((r: any) => [r.achievement_id, r.earned_at]));
    res.json({
      achievements: all.rows.map((a: any) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        description: a.description,
        icon: a.icon,
        xpReward: a.xp_reward,
        earned: earnedMap.has(a.id),
        earnedAt: earnedMap.get(a.id) ?? null
      }))
    });
  } catch (error) { next(error); }
});

// ─── DAILY GOALS ──────────────────────────────
router.get('/goals/daily', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query(
      'SELECT * FROM daily_goals WHERE user_id = $1 AND goal_date = CURRENT_DATE',
      [userId]
    );
    const g = result.rows[0] || { games_played: 0, games_won: 0, different_games: '[]', total_wagered: 0, claimed: false };
    const differentGames = typeof g.different_games === 'string' ? JSON.parse(g.different_games) : (g.different_games || []);
    const goals = [
      { id: 'play3', label: 'Play 3 games', progress: Math.min(g.games_played, 3), target: 3, done: g.games_played >= 3 },
      { id: 'win1', label: 'Win 1 game', progress: Math.min(g.games_won, 1), target: 1, done: g.games_won >= 1 },
      { id: 'try2', label: 'Try 2 different games', progress: Math.min(differentGames.length, 2), target: 2, done: differentGames.length >= 2 },
      { id: 'wager', label: 'Wager ৳500 total', progress: Math.min(Number(g.total_wagered), 50000), target: 50000, done: Number(g.total_wagered) >= 50000 }
    ];
    const allDone = goals.every(g => g.done);
    res.json({ goals, allComplete: allDone, claimed: g.claimed ?? false, xpReward: 100 });
  } catch (error) { next(error); }
});

router.post('/goals/daily/claim', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query(
      'SELECT * FROM daily_goals WHERE user_id = $1 AND goal_date = CURRENT_DATE',
      [userId]
    );
    const g = result.rows[0];
    if (!g) return res.status(400).json({ error: 'No progress today' });
    if (g.claimed) return res.status(400).json({ error: 'Already claimed' });

    const differentGames = typeof g.different_games === 'string' ? JSON.parse(g.different_games) : (g.different_games || []);
    const allDone = g.games_played >= 3 && g.games_won >= 1 && differentGames.length >= 2 && Number(g.total_wagered) >= 50000;
    if (!allDone) return res.status(400).json({ error: 'Not all goals completed' });

    await pool.query(
      'UPDATE daily_goals SET claimed = TRUE WHERE user_id = $1 AND goal_date = CURRENT_DATE',
      [userId]
    );
    await pool.query(
      `INSERT INTO user_scores (user_id, xp) VALUES ($1, 100)
       ON CONFLICT (user_id) DO UPDATE SET xp = user_scores.xp + 100, updated_at = NOW()`,
      [userId]
    );
    // Check daily_complete achievement
    try {
      await pool.query(
        `INSERT INTO user_achievements (user_id, achievement_id)
         SELECT $1, id FROM achievements WHERE slug = 'daily_complete'
         ON CONFLICT DO NOTHING`,
        [userId]
      );
    } catch { /* ignore */ }

    res.json({ claimed: true, xpAwarded: 100 });
  } catch (error) { next(error); }
});

// ─── GAME HISTORY ──────────────────────────────
router.get('/history', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query(
      'SELECT * FROM game_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    res.json({ history: result.rows });
  } catch (error) { next(error); }
});

export default router;
export { SPIN_SEGMENTS };
