import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import {
  ArrowDownToLine, ArrowUpFromLine, ChevronRight, CircleDollarSign, Crown,
  Dice5, Download, Gamepad2, Globe2, Languages, Menu, Radio, ReceiptText,
  ShieldCheck, Smartphone, Sparkles, Trophy, User, WalletCards, X
} from 'lucide-react';

const apiBase = import.meta.env.VITE_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';

const copy = {
  en: { games: 'Games', market: 'Market', wallet: 'Wallet', activity: 'Activity', profile: 'Profile', deposit: 'Deposit', withdraw: 'Withdraw', balance: 'Balance', demo: 'Sandbox', download: 'Download Android APK', store: 'Get it on Store', lobby: 'Arena Lobby', live: 'Live' },
  bn: { games: 'গেম', market: 'বাজার', wallet: 'ওয়ালেট', activity: 'লেনদেন', profile: 'প্রোফাইল', deposit: 'ডিপোজিট', withdraw: 'উইথড্র', balance: 'ব্যালেন্স', demo: 'সিমুলেশন', download: 'Android APK ডাউনলোড', store: 'স্টোরে দেখুন', lobby: 'এরিনা লবি', live: 'লাইভ' }
};

type Lang = 'en' | 'bn';
type Tab = 'games' | 'market' | 'wallet' | 'activity' | 'profile';

function formatBDT(minor: number | string) {
  return new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 })
    .format(Number(minor) / 100);
}

export default function App() {
  const [lang, setLang] = useState<Lang>('en');
  const [tab, setTab] = useState<Tab>('games');
  const [walletOpen, setWalletOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [balance, setBalance] = useState(250000);
  const [status, setStatus] = useState('Connecting');
  const [selectedGame, setSelectedGame] = useState('Ludo');
  const t = copy[lang];

  useEffect(() => {
    fetch(`${apiBase}/api/health`).then(r => r.json()).then(() => setStatus('Online')).catch(() => setStatus('API offline'));
  }, []);

  useEffect(() => {
    const socket = io(`${apiBase}/markets`, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => setStatus('Live market'));
    socket.on('disconnect', () => setStatus('Disconnected'));
    return () => { socket.disconnect(); };
  }, []);

  const nav = useMemo(() => [
    ['games', Gamepad2, t.games], ['market', Globe2, t.market], ['wallet', WalletCards, t.wallet],
    ['activity', ReceiptText, t.activity], ['profile', User, t.profile]
  ] as [Tab, typeof Gamepad2, string][], [t]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab('games')} aria-label="BDT Arena home">
          <span className="brand-mark"><Crown size={18} /></span>
          <span>BDT <b>ARENA</b></span>
        </button>
        <div className="status-pill"><span className="status-dot" />{status}</div>
        <div className="wallet-summary">
          <div><span>{t.balance}</span><strong>{formatBDT(balance)}</strong></div>
          <button className="primary small" onClick={() => setWalletOpen(true)}><ArrowDownToLine size={16} /> {t.deposit}</button>
          <button className="ghost small" onClick={() => setWalletOpen(true)}><ArrowUpFromLine size={16} /> {t.withdraw}</button>
          <button className="icon-button" onClick={() => setLang(lang === 'en' ? 'bn' : 'en')} title="Language">
            <Languages size={18} /><span>{lang === 'en' ? 'EN' : 'বাংলা'}</span>
          </button>
        </div>
      </header>

      <aside className="sidebar">
        {nav.map(([id, Icon, label]) => (
          <button key={id} className={tab === id ? 'nav-item active' : 'nav-item'} onClick={() => setTab(id)}>
            <Icon size={20} /><span>{label}</span>
          </button>
        ))}
        <button className="nav-item" onClick={() => setDownloadOpen(true)}><Download size={20} /><span>Mobile</span></button>
      </aside>

      <main className="main-content">
        {tab === 'games' && <Games lang={lang} selected={selectedGame} setSelected={setSelectedGame} />}
        {tab === 'market' && <Markets />}
        {tab === 'wallet' && <Wallet lang={lang} balance={balance} openWallet={() => setWalletOpen(true)} />}
        {tab === 'activity' && <Activity />}
        {tab === 'profile' && <Profile lang={lang} />}
      </main>

      <nav className="mobile-nav">
        {nav.map(([id, Icon, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={19} /><span>{label}</span></button>
        ))}
      </nav>

      <button className="activity-button" onClick={() => setDrawerOpen(true)} aria-label="Open activity"><ReceiptText size={18} /><span>{t.activity}</span></button>

      {walletOpen && <WalletModal lang={lang} onClose={() => setWalletOpen(false)} />}
      {drawerOpen && <ActivityDrawer onClose={() => setDrawerOpen(false)} />}
      {downloadOpen && <DownloadModal onClose={() => setDownloadOpen(false)} />}

      <button className="download-banner" onClick={() => setDownloadOpen(true)}>
        <Smartphone size={17} /><span>{t.download}</span><ChevronRight size={16} />
      </button>
    </div>
  );
}

function Games({ lang, selected, setSelected }: { lang: Lang; selected: string; setSelected: (value: string) => void }) {
  const games = [
    { name: 'Ludo', icon: '◆', tone: 'coral', detail: lang === 'en' ? '4-token multiplayer' : '৪-টোকেন মাল্টিপ্লেয়ার' },
    { name: 'Chess', icon: '♛', tone: 'gold', detail: lang === 'en' ? 'Rated & quick' : 'রেটেড ও দ্রুত' },
    { name: 'Crash', icon: '↗', tone: 'cyan', detail: lang === 'en' ? 'Cash out before crash' : 'ক্র্যাশের আগে উইথড্র' },
    { name: 'Dice', icon: '⚄', tone: 'violet', detail: lang === 'en' ? 'Provably fair' : 'প্রমাণযোগ্য ন্যায্য' },
    { name: 'Spin', icon: '◉', tone: 'green', detail: lang === 'en' ? 'Multiplier wheel' : 'মাল্টিপ্লায়ার হুইল' }
  ];
  return (
    <section>
      <div className="section-heading"><div><span className="eyebrow">{lang === 'en' ? 'PLAY NOW' : 'এখন খেলুন'}</span><h1>{lang === 'en' ? 'Arena Lobby' : 'এরিনা লবি'}</h1></div><span className="mode-badge"><ShieldCheck size={14} /> Sandbox</span></div>
      <div className="game-grid">
        {games.map(game => (
          <button key={game.name} className={`game-card ${game.tone} ${selected === game.name ? 'selected' : ''}`} onClick={() => setSelected(game.name)}>
            <div className="game-art"><span>{game.icon}</span></div>
            <div className="game-card-footer"><div><strong>{game.name}</strong><small>{game.detail}</small></div><ChevronRight size={18} /></div>
          </button>
        ))}
      </div>
      <GameTable selected={selected} />
    </section>
  );
}

function GameTable({ selected }: { selected: string }) {
  return (
    <div className="panel live-panel">
      <div className="panel-heading"><div><span className="eyebrow"><Radio size={12} /> LIVE TABLES</span><h2>{selected} Arena</h2></div><button className="ghost small">Find match</button></div>
      <div className="table-list">
        {[1, 2, 3].map((row) => (
          <div className="table-row" key={row}><span className="table-id">#{1040 + row}</span><div className="players"><i /><i /><i /><i /></div><div><small>Entry</small><strong>৳ {row * 100}</strong></div><button className="primary small">Join</button></div>
        ))}
      </div>
    </div>
  );
}

function Markets() {
  const [prices, setPrices] = useState<Record<string, number>>({ 'USD/BDT': 122.45, 'EUR/USD': 1.084, 'XAU/BDT': 184750, 'XAU/USD': 2637.2 });
  useEffect(() => {
    const socket = io(`${apiBase}/markets`, { transports: ['websocket', 'polling'] });
    socket.on('prices', setPrices);
    return () => { socket.disconnect(); };
  }, []);
  return (
    <section>
      <div className="section-heading"><div><span className="eyebrow">SIMULATED FEED</span><h1>Trading Desk</h1></div><span className="mode-badge"><Radio size={14} /> Live ticker</span></div>
      <div className="ticker-grid">
        {Object.entries(prices).map(([symbol, price], index) => (
          <article className="ticker-card" key={symbol}><div><small>{symbol}</small><strong>{price.toLocaleString(undefined, { maximumFractionDigits: symbol.includes('EUR') ? 4 : 2 })}</strong></div><span className={index % 2 ? 'down' : 'up'}>{index % 2 ? '-0.18%' : '+0.24%'}</span><div className="sparkline"><i /><i /><i /><i /><i /><i /></div></article>
        ))}
      </div>
      <div className="trade-layout">
        <div className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">XAU / BDT</span><h2>Spot Gold</h2></div><strong>৳ 184,750</strong></div><div className="chart-bars">{[42,58,46,72,64,78,69,88,83,96,91,104].map((h,i)=><i key={i} style={{height:`${h}px`}} />)}</div></div>
        <TradeTicket />
      </div>
    </section>
  );
}

function TradeTicket() {
  return <aside className="panel trade-ticket"><h2>Open position</h2><div className="segmented"><button className="buy">BUY</button><button>SELL</button></div><label>Symbol<select><option>XAU/BDT</option><option>XAU/USD</option><option>USD/BDT</option><option>EUR/USD</option></select></label><label>Quantity<input type="number" defaultValue="1" /></label><div className="two-col"><label>Take profit<input type="number" placeholder="0.00" /></label><label>Stop loss<input type="number" placeholder="0.00" /></label></div><div className="margin-row"><span>Margin</span><strong>৳ 10,000</strong></div><button className="primary wide">Open simulated trade</button></aside>;
}

function Wallet({ lang, balance, openWallet }: { lang: Lang; balance: number; openWallet: () => void }) {
  return <section><div className="section-heading"><div><span className="eyebrow">{lang === 'en' ? 'BDT WALLET' : 'BDT ওয়ালেট'}</span><h1>{formatBDT(balance)}</h1></div></div><div className="wallet-actions"><button className="primary" onClick={openWallet}><ArrowDownToLine size={18} /> Deposit</button><button className="ghost" onClick={openWallet}><ArrowUpFromLine size={18} /> Withdraw</button></div><Activity /></section>;
}

function Activity() {
  const rows = [{name:'Sandbox deposit',time:'12:42',amount:'+ ৳ 2,500',type:'completed'},{name:'Ludo entry fee',time:'11:18',amount:'- ৳ 100',type:'completed'},{name:'XAU/BDT margin',time:'10:03',amount:'- ৳ 1,000',type:'pending'}];
  return <div className="panel ledger-panel"><div className="panel-heading"><div><span className="eyebrow">LEDGER</span><h2>Recent activity</h2></div><span className="mode-badge">3 entries</span></div>{rows.map(row=><div className="ledger-row" key={row.name}><div className="ledger-icon"><ReceiptText size={16}/></div><div><strong>{row.name}</strong><small>{row.time} · {row.type}</small></div><b className={row.amount.startsWith('+')?'positive':''}>{row.amount}</b></div>)}</div>;
}

function Profile({ lang }: { lang: Lang }) {
  return <section><div className="section-heading"><div><span className="eyebrow">ACCOUNT</span><h1>{lang === 'en' ? 'Profile & security' : 'প্রোফাইল ও নিরাপত্তা'}</h1></div></div><div className="panel profile-card"><div className="avatar">DA</div><div><h2>Demo Arena</h2><p>+8801700000002</p></div><span className="mode-badge">User</span></div></section>;
}

function WalletModal({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const [mode, setMode] = useState<'deposit'|'withdraw'>('deposit');
  const [rail, setRail] = useState('bKash');
  return <div className="overlay" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={18}/></button><h2>{mode === 'deposit' ? 'Deposit BDT' : 'Withdraw BDT'}</h2><div className="segmented"><button className={mode==='deposit'?'buy':''} onClick={()=>setMode('deposit')}>{lang==='en'?'Deposit':'ডিপোজিট'}</button><button className={mode==='withdraw'?'buy':''} onClick={()=>setMode('withdraw')}>{lang==='en'?'Withdraw':'উইথড্র'}</button></div><div className="rail-options"><button className={rail==='bKash'?'active':''} onClick={()=>setRail('bKash')}><b>b</b><span>bKash</span></button><button className={rail==='Nagad'?'active':''} onClick={()=>setRail('Nagad')}><b>N</b><span>Nagad</span></button></div><label>Amount (BDT)<input type="number" defaultValue="2500" /></label>{mode==='withdraw'&&<label>{lang==='en'?'Mobile / agent number':'মোবাইল / এজেন্ট নম্বর'}<input placeholder="+8801XXXXXXXXX" /></label>}<button className="primary wide" onClick={onClose}>{mode==='deposit'?'Create sandbox checkout':'Submit withdrawal'}</button><p className="sandbox-note"><ShieldCheck size={14}/> Payment mode: Sandbox</p></div></div>;
}

function ActivityDrawer({ onClose }: { onClose: () => void }) {
  return <><div className="drawer-backdrop" onClick={onClose}/><aside className="drawer"><div className="drawer-header"><h2>Transaction log</h2><button className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="drawer-mode"><span className="status-dot"/>Sandbox / live local</div><Activity /></aside></>;
}

function DownloadModal({ onClose }: { onClose: () => void }) {
  return <div className="overlay" onMouseDown={onClose}><div className="modal download-modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={18}/></button><div className="download-icon"><Smartphone size={28}/></div><h2>Take BDT Arena mobile</h2><p>Play games and monitor simulated markets on Android.</p><a className="primary wide link-button" href="/downloads/bdt-arena.apk" download><Download size={18}/>Download Android APK</a><a className="store-button" href="https://play.google.com/store/apps" target="_blank" rel="noreferrer"><Sparkles size={18}/>Get it on Store</a><small>Replacement APK and store URL required before public release.</small></div></div>;
}
