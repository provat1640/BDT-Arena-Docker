-- v2: Scoring, achievements, game results, daily goals

CREATE TABLE IF NOT EXISTS user_scores (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp BIGINT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 1,
  total_games INT NOT NULL DEFAULT 0,
  total_wins INT NOT NULL DEFAULT 0,
  current_streak INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon VARCHAR(8) NOT NULL DEFAULT '🏆',
  xp_reward INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game VARCHAR(16) NOT NULL,
  bet_minor BIGINT NOT NULL DEFAULT 0,
  payout_minor BIGINT NOT NULL DEFAULT 0,
  multiplier NUMERIC(10,4) NOT NULL DEFAULT 0,
  result JSONB NOT NULL DEFAULT '{}',
  xp_earned INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_goals (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  games_played INT NOT NULL DEFAULT 0,
  games_won INT NOT NULL DEFAULT 0,
  different_games JSONB NOT NULL DEFAULT '[]',
  total_wagered BIGINT NOT NULL DEFAULT 0,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, goal_date)
);

CREATE INDEX IF NOT EXISTS idx_game_results_user ON game_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_goals_date ON daily_goals(goal_date, user_id);

-- Seed default achievements
INSERT INTO achievements (slug, name, description, icon, xp_reward) VALUES
  ('first_win',      'First Victory',    'Win your first game',           '🥇', 50),
  ('ten_games',      'Seasoned Player',  'Play 10 games',                 '🎮', 100),
  ('streak_3',       'Hot Streak',       'Win 3 games in a row',          '🔥', 150),
  ('try_all',        'Explorer',         'Try all 3 game modes',          '🧭', 200),
  ('high_roller',    'High Roller',      'Bet ৳5,000+ in a single game', '💰', 250),
  ('fifty_games',    'Veteran',          'Play 50 games',                 '⭐', 500),
  ('streak_5',       'On Fire',          'Win 5 games in a row',          '💎', 400),
  ('level_5',        'Rising Star',      'Reach level 5',                 '🌟', 300),
  ('level_10',       'Arena Champion',   'Reach level 10',                '👑', 1000),
  ('daily_complete', 'Daily Grinder',    'Complete all daily goals',       '📋', 100)
ON CONFLICT (slug) DO NOTHING;
