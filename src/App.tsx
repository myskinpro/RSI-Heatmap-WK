import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine, Cell, ZAxis } from 'recharts';
import { RefreshCw, TrendingUp, ChevronUp, ChevronDown, BarChart2, HelpCircle, User, X, Pin, Volume2, VolumeX } from 'lucide-react';
import axios from 'axios';
import { CoinHistoryModal } from './components/CoinHistoryModal';
import { Dashboard } from './components/Dashboard';
import { IrpfForm } from './components/IrpfForm';
import Evolution from './components/Evolution';
import RiskCalculator from './components/RiskCalculator';
import TradeJournal from './components/TradeJournal';
import Strategy from './components/Strategy';

interface CryptoData {
  id: string;
  symbol: string;
  name: string;
  ticker: string;
  rsi: number;
  prevRsi?: number;
  recentMaxRsi?: number;
  recentMinRsi?: number;
  stochK?: number;
  stochD?: number;
  kairi?: number;
  fibLong?: number;
  fibShort?: number;
  marketCap: number;
  price: number;
  priceChange: number;
  zone: string;
  rank: number;
  leverage?: number | null;
  emaCross?: 'up' | 'down' | 'bullish' | 'bearish' | 'none';
}

const ZONES = [
  { name: 'Overbought', min: 70, max: 100, color: '#EF4444', fill: 'rgba(239, 68, 68, 0.15)' },
  { name: 'Neutral', min: 30, max: 70, color: '#6B7280', fill: 'rgba(107, 114, 128, 0.08)' },
  { name: 'Oversold', min: 0, max: 30, color: '#10B981', fill: 'rgba(16, 185, 129, 0.15)' }
];

const LIMITS = [
  { label: 'Top 50', value: 50 },
  { label: 'Top 100', value: 100 },
  { label: 'Top 200', value: 200 }
];

const formatMarketCap = (marketCap: number) => {
  if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(2)}T`;
  if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
  if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
  return `$${marketCap.toLocaleString()}`;
};

export type SignalType = 'LONG' | 'SHORT' | null;
export type MultiRowStatus = 'LONG' | 'SHORT' | 'WAITING' | null;

export interface MultiSignalInfo {
  status: MultiRowStatus;
  signal: SignalType;
  liveStatus1h: 'SV' | 'SC' | null;
  effective1h: 'SV' | 'SC' | null;
  status1m: 'SV' | 'SC' | null;
  rsi1h: number | null;
  rsi1m: number | null;
}

export function evaluateMultiSignal(
  tf1h?: CryptoData,
  tf1m?: CryptoData,
  autoTrigger1h?: 'SV' | 'SC'
): MultiSignalInfo {
  const rsi1h = tf1h && typeof tf1h.rsi === 'number' ? tf1h.rsi : null;
  const rsi1m = tf1m && typeof tf1m.rsi === 'number' ? tf1m.rsi : null;

  let liveStatus1h: 'SV' | 'SC' | null = null;
  if (rsi1h !== null) {
    if (rsi1h <= 30) liveStatus1h = 'SV';
    else if (rsi1h >= 70) liveStatus1h = 'SC';
  }

  let status1m: 'SV' | 'SC' | null = null;
  if (rsi1m !== null) {
    if (rsi1m <= 30) status1m = 'SV';
    else if (rsi1m >= 70) status1m = 'SC';
  }

  // Use live 1H SV/SC touch if active, otherwise preserve the 1H SV/SC touch that auto-pinned this coin
  const effective1h = liveStatus1h ?? autoTrigger1h ?? null;

  let signal: SignalType = null;
  let status: MultiRowStatus = null;

  if (effective1h === 'SV') {
    if (status1m === 'SC') {
      // 1H tocou SV + 1M entrou em SC (oposto) = Sinal SHORT
      signal = 'SHORT';
      status = 'SHORT';
    } else {
      status = 'WAITING';
    }
  } else if (effective1h === 'SC') {
    if (status1m === 'SV') {
      // 1H tocou SC + 1M entrou em SV (oposto) = Sinal LONG
      signal = 'LONG';
      status = 'LONG';
    } else {
      status = 'WAITING';
    }
  }

  return { status, signal, liveStatus1h, effective1h, status1m, rsi1h, rsi1m };
}

export default function App() {
  const [data, setData] = useState<CryptoData[]>([]);
  const [multiData, setMultiData] = useState<Record<string, Record<string, CryptoData>>>({});
  const [pinnedCoins, setPinnedCoins] = useState<string[]>([]);
  const [autoPinnedTriggers, setAutoPinnedTriggers] = useState<Record<string, 'SV' | 'SC'>>({});
  const dismissedCoinsRef = useRef<Set<string>>(new Set());
  const lastFetchTimeRef = useRef<number>(Date.now());
  const [loading, setLoading] = useState(true);
  const [timeframe] = useState('1h');
  const [limit, setLimit] = useState(100);
  const [minMarketCap, setMinMarketCap] = useState(200000000); // 200M+ default
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [multiFilter, setMultiFilter] = useState('Monitoring');
  const [multiSortBy, setMultiSortBy] = useState<'ticker' | 'signal' | 'marketCap' | 'rsi1h' | 'rsi1m'>('signal');
  const [multiSortOrder, setMultiSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showScatter, setShowScatter] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('multiTimeframeSoundAlert');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const soundEnabledRef = useRef(soundEnabled);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevActiveSignalsRef = useRef<Map<string, 'LONG' | 'SHORT'>>(new Map());

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    try {
      localStorage.setItem('multiTimeframeSoundAlert', String(soundEnabled));
    } catch {
      // Ignore storage errors
    }
  }, [soundEnabled]);

  const getAudioContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  };

  // Unlock browser AudioContext on first user interaction so background signal alerts can play
  useEffect(() => {
    const unlockAudio = () => {
      if (soundEnabledRef.current) {
        getAudioContext();
      }
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const playSoftSignalAlert = (type: 'LONG' | 'SHORT') => {
    try {
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;

      const now = ctx.currentTime;
      // Soft, mellow two-note sine chime (ascending for LONG, descending for SHORT)
      const notes = type === 'LONG' ? [523.25, 659.25] : [659.25, 523.25];

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.14;
        const duration = 0.42;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.055, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + duration + 0.02);
      });
    } catch {
      // Ignore audio playback errors
    }
  };

  const handleToggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      if (next) {
        const ctx = getAudioContext();
        if (ctx) {
          if (ctx.state === 'suspended') {
            ctx.resume().then(() => playSoftSignalAlert('LONG')).catch(() => {});
          } else {
            playSoftSignalAlert('LONG');
          }
        }
      }
      return next;
    });
  };

  const handleMultiSort = (column: 'ticker' | 'signal' | 'marketCap' | 'rsi1h' | 'rsi1m') => {
    if (multiSortBy === column) {
      setMultiSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setMultiSortBy(column);
      setMultiSortOrder(column === 'marketCap' || column === 'signal' ? 'desc' : 'asc');
    }
  };
  const [showTable, setShowTable] = useState(true);
  const [activeTab, setActiveTab] = useState<'heatmap' | 'dashboard' | 'irpf' | 'evolution' | 'risk' | 'journal' | 'strategy'>('heatmap');
  
  const [selectedCoin, setSelectedCoin] = useState<CryptoData | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch 1h (for RSI Distribution & Multi-Timeframe) and 1m (for Multi-Timeframe entry trigger)
      const tfsToFetch = ['1h', '1m'];

      const responses = await Promise.all(
        tfsToFetch.map(tf =>
          axios
            .get('/api/crypto-rsi', {
              params: { timeframe: tf, limit, minMarketCap },
              timeout: 60000
            })
            .catch(() => ({ data: [] }))
        )
      );

      const newMulti: Record<string, Record<string, CryptoData>> = {};
      let selectedData: CryptoData[] = [];

      responses.forEach((res, i) => {
        const tf = tfsToFetch[i];
        if (Array.isArray(res.data)) {
          res.data.forEach((coin: CryptoData) => {
            if (!coin || !coin.ticker) return;
            const sym = coin.ticker.toUpperCase();
            if (!newMulti[sym]) newMulti[sym] = {};
            newMulti[sym][tf] = coin;
          });
          if (tf === '1h') {
            const seenTickers = new Set<string>();
            selectedData = [];
            for (const c of res.data) {
              if (c && c.ticker && !seenTickers.has(c.ticker.toUpperCase())) {
                seenTickers.add(c.ticker.toUpperCase());
                selectedData.push({ ...c, ticker: c.ticker.toUpperCase() });
              }
            }
          }
        }
      });

      setData(selectedData);
      setMultiData(newMulti);
      setLastUpdated(new Date());
      lastFetchTimeRef.current = Date.now();
    } catch (error: any) {
      console.error("Failed to fetch data:", error.message);
      setData([]); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Auto-refresh every 90s, but only if the user is actively viewing the tab (saves 80-90% bandwidth)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchData();
    }, 90000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const now = Date.now();
        // If user returns after more than 90 seconds away, refresh immediately
        if (now - lastFetchTimeRef.current >= 90000) {
          fetchData();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [timeframe, limit, minMarketCap]);

  // Auto-pin any coin that touches SV (<= 30) or SC (>= 70) in RSI Distribution (1H)
  useEffect(() => {
    if (!data || data.length === 0) return;

    const toPin: string[] = [];
    const newTriggers: Record<string, 'SV' | 'SC'> = {};

    for (const coin of data) {
      if (!coin || !coin.ticker || typeof coin.rsi !== 'number') continue;
      const sym = coin.ticker.toUpperCase();
      const isSV = coin.rsi <= 30;
      const isSC = coin.rsi >= 70;

      if (isSV || isSC) {
        if (!dismissedCoinsRef.current.has(sym)) {
          toPin.push(sym);
          newTriggers[sym] = isSV ? 'SV' : 'SC';
        }
      } else {
        // Coin left SV/SC zone: allow future touches to auto-pin again
        if (dismissedCoinsRef.current.has(sym)) {
          dismissedCoinsRef.current.delete(sym);
        }
      }
    }

    if (toPin.length > 0) {
      setPinnedCoins(prev => {
        const next = [...prev];
        let changed = false;
        for (const sym of toPin) {
          if (!next.includes(sym)) {
            next.push(sym);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }

    if (Object.keys(newTriggers).length > 0) {
      setAutoPinnedTriggers(prev => {
        let changed = false;
        const next = { ...prev };
        for (const [sym, trigger] of Object.entries(newTriggers)) {
          if (next[sym] !== trigger) {
            next[sym] = trigger;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [data]);

  const handleUnpinCoin = (ticker: string) => {
    dismissedCoinsRef.current.add(ticker);
    setPinnedCoins(prev => prev.filter(p => p !== ticker));
    setAutoPinnedTriggers(prev => {
      if (!(ticker in prev)) return prev;
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
  };

  const handlePinCoin = (ticker: string) => {
    dismissedCoinsRef.current.delete(ticker);
    setPinnedCoins(prev => (prev.includes(ticker) ? prev : [...prev, ticker]));
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[rgba(0,0,0,0.9)] border border-border p-3 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.5)] text-sm z-10 pointer-events-none">
          <div className="font-bold mb-2 border-b border-border pb-1 text-text-main">{data.name} ({data.ticker})</div>
          <div className="flex justify-between gap-8 mt-1">
            <span className="text-text-dim">Price</span>
            <span className="text-text-main">${data.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
          </div>
          <div className="flex justify-between gap-8 mt-1">
            <span className="text-text-dim">RSI (14) • 1H</span>
            <span className="font-bold" style={{ color: getZoneColor(data.rsi) }}>{data.rsi}</span>
          </div>
          <div className="flex justify-between gap-8 mt-1">
            <span className="text-text-dim">Market Cap</span>
            <span className="text-text-main">{formatMarketCap(data.marketCap)}</span>
          </div>
          <div className="flex justify-between gap-8 mt-1">
            <span className="text-text-dim">Rank</span>
            <span className="text-text-main">#{data.rank}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const getZoneColor = (rsi: number) => {
    const zone = ZONES.find(z => rsi >= z.min && rsi <= z.max) || ZONES[2];
    return zone.color;
  };

  const CustomLabel = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy || !payload) return null;
    return (
      <text 
        x={cx} 
        y={cy - 15} 
        fill="var(--color-text-main)" 
        fontSize={14} 
        fontWeight="bold"
        textAnchor="middle"
        className="pointer-events-none font-bold font-mono"
      >
        {payload.ticker}
      </text>
    );
  };

  const evaluatedMultiCoins = useMemo(() => {
    return data
      .filter((c, i, arr) => arr.findIndex(x => x.ticker === c.ticker) === i)
      .map(coin => {
        const ticker = coin.ticker;
        const tfs = multiData[ticker] || {};
        const tf1h = tfs['1h'] || coin;
        const tf1m = tfs['1m'];
        const autoTrigger1h = autoPinnedTriggers[ticker];
        const signalInfo = evaluateMultiSignal(tf1h, tf1m, autoTrigger1h);

        return {
          ...coin,
          tfs: { '1h': tf1h, '1m': tf1m },
          ...signalInfo
        };
      });
  }, [data, multiData, autoPinnedTriggers]);

  // Play soft sound alert ONLY when a coin newly enters a LONG or SHORT signal
  useEffect(() => {
    if (evaluatedMultiCoins.length === 0) return;

    const nextActiveSignals = new Map<string, 'LONG' | 'SHORT'>();
    let newlyTriggeredSignal: 'LONG' | 'SHORT' | null = null;

    for (const coin of evaluatedMultiCoins) {
      if (coin.signal === 'LONG' || coin.signal === 'SHORT') {
        nextActiveSignals.set(coin.ticker, coin.signal);
        const prevSignal = prevActiveSignalsRef.current.get(coin.ticker);
        if (prevSignal !== coin.signal && !newlyTriggeredSignal) {
          newlyTriggeredSignal = coin.signal;
        }
      }
    }

    prevActiveSignalsRef.current = nextActiveSignals;

    if (newlyTriggeredSignal && soundEnabledRef.current) {
      playSoftSignalAlert(newlyTriggeredSignal);
    }
  }, [evaluatedMultiCoins]);

  const multiRows = useMemo(() => {
    return evaluatedMultiCoins
      .filter(coin => {
        const ticker = coin.ticker;
        const isPinned = pinnedCoins.includes(ticker);
        if (multiFilter === 'All') return true;
        if (multiFilter === 'Monitoring') return isPinned;
        if (multiFilter === 'Signals') return coin.signal !== null;
        if (multiFilter === 'LONG') return coin.signal === 'LONG';
        if (multiFilter === 'SHORT') return coin.signal === 'SHORT';
        if (multiFilter === 'Waiting') return coin.status === 'WAITING';
        return true;
      })
      .sort((a, b) => {
        const aPinned = pinnedCoins.includes(a.ticker);
        const bPinned = pinnedCoins.includes(b.ticker);

        const rsi1hA = a.rsi1h ?? 50;
        const rsi1hB = b.rsi1h ?? 50;
        const rsi1mA = a.rsi1m ?? 50;
        const rsi1mB = b.rsi1m ?? 50;

        if (multiSortBy === 'signal') {
          const rankVal = (row: typeof a, pinned: boolean) => {
            if (row.status === 'LONG') return 5;
            if (row.status === 'SHORT') return 4;
            if (row.status === 'WAITING') return 3;
            if (pinned) return 2;
            return 0;
          };
          const rankA = rankVal(a, aPinned);
          const rankB = rankVal(b, bPinned);
          if (rankA !== rankB) {
            return multiSortOrder === 'desc' ? rankB - rankA : rankA - rankB;
          }
          return a.ticker.localeCompare(b.ticker);
        }

        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;

        if (multiSortBy === 'rsi1h') {
          return multiSortOrder === 'desc' ? rsi1hB - rsi1hA : rsi1hA - rsi1hB;
        }

        if (multiSortBy === 'rsi1m') {
          return multiSortOrder === 'desc' ? rsi1mB - rsi1mA : rsi1mA - rsi1mB;
        }

        if (multiSortBy === 'marketCap') {
          return multiSortOrder === 'desc'
            ? (b.marketCap || 0) - (a.marketCap || 0)
            : (a.marketCap || 0) - (b.marketCap || 0);
        }

        // Default: A-Z by ticker
        return multiSortOrder === 'desc'
          ? b.ticker.localeCompare(a.ticker)
          : a.ticker.localeCompare(b.ticker);
      });
  }, [evaluatedMultiCoins, pinnedCoins, multiFilter, multiSortBy, multiSortOrder]);

  return (
    <div className="min-h-screen bg-bg text-text-main font-sans flex flex-col">
      <div className="flex gap-6 px-6 pt-6 pb-2 border-b border-border/50">
        <button 
          onClick={() => setActiveTab('heatmap')} 
          className={`text-sm tracking-wider font-semibold transition-colors ${activeTab === 'heatmap' ? 'text-white border-b-2 border-accent pb-2 -mb-[9px]' : 'text-text-dim hover:text-white pb-2 -mb-[9px]'}`}
        >
          HEATMAP
        </button>
        <button 
          onClick={() => setActiveTab('dashboard')} 
          className={`text-sm tracking-wider font-semibold transition-colors ${activeTab === 'dashboard' ? 'text-white border-b-2 border-accent pb-2 -mb-[9px]' : 'text-text-dim hover:text-white pb-2 -mb-[9px]'}`}
        >
          DASHBOARD
        </button>
        <button 
          onClick={() => setActiveTab('irpf')} 
          className={`text-sm tracking-wider font-semibold transition-colors ${activeTab === 'irpf' ? 'text-white border-b-2 border-accent pb-2 -mb-[9px]' : 'text-text-dim hover:text-white pb-2 -mb-[9px]'}`}
        >
          IRPF
        </button>
        <button 
          onClick={() => setActiveTab('evolution')} 
          className={`text-sm tracking-wider font-semibold transition-colors ${activeTab === 'evolution' ? 'text-white border-b-2 border-accent pb-2 -mb-[9px]' : 'text-text-dim hover:text-white pb-2 -mb-[9px]'}`}
        >
          EVOLUÇÃO
        </button>
        <button 
          onClick={() => setActiveTab('risk')} 
          className={`text-sm tracking-wider font-semibold transition-colors ${activeTab === 'risk' ? 'text-white border-b-2 border-accent pb-2 -mb-[9px]' : 'text-text-dim hover:text-white pb-2 -mb-[9px]'}`}
        >
          CALCULADORA DE RISCO
        </button>
        <button 
          onClick={() => setActiveTab('journal')} 
          className={`text-sm tracking-wider font-semibold transition-colors ${activeTab === 'journal' ? 'text-white border-b-2 border-accent pb-2 -mb-[9px]' : 'text-text-dim hover:text-white pb-2 -mb-[9px]'}`}
        >
          DIÁRIO DE TRADE
        </button>
        <button 
          onClick={() => setActiveTab('strategy')} 
          className={`text-sm tracking-wider font-semibold transition-colors ${activeTab === 'strategy' ? 'text-white border-b-2 border-accent pb-2 -mb-[9px]' : 'text-text-dim hover:text-white pb-2 -mb-[9px]'}`}
        >
          ESTRATÉGIA
        </button>
      </div>

      {activeTab === 'heatmap' ? (
        <>
          <div className="px-6 py-3 flex flex-col md:flex-row justify-end items-center border-b border-border bg-surface gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-text-dim tracking-wider">MarketCap</label>
                <select 
                  value={minMarketCap} 
                  onChange={(e) => setMinMarketCap(Number(e.target.value))}
                  className="bg-surface-light border border-border px-4 py-2 rounded-full text-sm text-text-main cursor-pointer outline-none focus:border-accent"
                >
                  <option value={0}>All</option>
                  <option value={200000000}>$200M+</option>
                  <option value={500000000}>$500M+</option>
                  <option value={1000000000}>$1B+</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-text-dim tracking-wider">Timeframe</label>
                <div className="bg-surface-light border border-border px-4 py-2 rounded-full text-sm text-accent font-semibold font-mono select-none">
                  1h
                </div>
              </div>

              <button 
                onClick={fetchData}
                disabled={loading}
                className="mt-4 p-2 bg-surface-light border border-border hover:bg-border rounded-full transition-colors disabled:opacity-50 text-text-main"
                title="Refresh Data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <main className="flex-1 flex flex-col p-6 gap-4">
        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-6 text-[10px] text-text-dim">
          {ZONES.map(zone => (
            <div key={zone.name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: zone.color }}></div>
              <span className="uppercase tracking-wider">{zone.name}</span>
            </div>
          ))}
        </div>

        {/* Chart Area */}
        <div className={`w-full bg-surface rounded-xl border border-border p-4 relative flex flex-col transition-all ${showScatter ? 'flex-1 min-h-[450px]' : ''}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-text-dim uppercase tracking-wider flex items-center gap-2">
              <span>RSI Distribution</span>
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/40 font-mono">
                1H
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-surface-light text-text-main border border-border font-mono">
                {data.length} {data.length === 1 ? 'Moeda' : 'Moedas'}
              </span>
            </h2>
            <button onClick={() => setShowScatter(!showScatter)} className="p-1 hover:bg-surface-light rounded transition-colors text-text-dim">
              {showScatter ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
          {showScatter && (
            <>
        
        <div style={{ width: '100%', height: 450, minHeight: 450 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 40, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              
              {/* X-Axis: Rank */}
            <XAxis 
              type="number" 
              dataKey="rank" 
              name="Rank" 
              domain={['dataMin - 2', 'dataMax + 2']} 
              tick={{ fill: 'var(--color-text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tickLine={{ stroke: 'var(--color-border)' }}
              axisLine={{ stroke: 'var(--color-border)' }}
              label={{ value: 'Market Cap Rank', position: 'insideBottom', offset: -10, fill: 'var(--color-text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            />
            
            {/* Y-Axis: RSI */}
            <YAxis 
              type="number" 
              dataKey="rsi" 
              name="RSI" 
              domain={[0, 100]} 
              ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
              tick={{ fill: 'var(--color-text-dim)', fontSize: 13, fontWeight: '500', fontFamily: 'var(--font-mono)' }}
              tickLine={{ stroke: 'var(--color-border)' }}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            
            {/* Z-Axis: Bubble size (fixed to make all points uniform) */}
            <ZAxis type="number" dataKey="marketCap" range={[80, 80]} />

            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'var(--color-border)' }} />

            {/* Background Zones */}
            {ZONES.map(zone => {
              const RefArea = ReferenceArea as any;
              return (
              <React.Fragment key={zone.name}>
                <RefArea 
                  y1={zone.min} 
                  y2={zone.max} 
                  fill={zone.fill} 
                  strokeOpacity={0}
                />
              </React.Fragment>
            )})}

            <Scatter data={data} animationDuration={1000} onClick={(data) => setSelectedCoin(data.payload)}>
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={getZoneColor(entry.rsi)}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={2}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                />
              ))}
            </Scatter>
            {/* Overlay labels since Recharts built-in labels can be hard to position without overlap */}
            <Scatter data={data} shape={<CustomLabel />} isAnimationActive={false} onClick={(data) => setSelectedCoin(data.payload)} />
          </ScatterChart>
        </ResponsiveContainer>
        </div>
        </>
        )}
      </div>

      <div className="flex-none w-full bg-surface rounded-xl border border-border p-4 flex flex-col mb-4 overflow-x-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-sm font-bold text-text-dim uppercase tracking-wider flex items-center gap-2">
            <span>Multi-Timeframe</span>
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/40 font-mono">
              1H + 1M
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-surface-light text-text-main border border-border font-mono">
              {multiRows.length} {multiRows.length === 1 ? 'Moeda' : 'Moedas'}
            </span>
            <div className="group relative flex items-center">
              <HelpCircle size={14} className="text-text-dim/50 hover:text-text-main cursor-help transition-colors" />
              <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-[#1a1a1b] shadow-2xl border border-border rounded-lg p-4 text-xs font-normal text-text-dim opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100]">
                <div className="mb-2 font-bold text-text-main text-sm">Regras Multi-Timeframe • 1H + 1M</div>
                <p className="text-xs text-text-dim leading-relaxed mb-3">
                  Sempre que uma moeda toca em <strong>SV (≤ 30)</strong> ou <strong>SC (≥ 70)</strong> no card <strong>RSI Distribution (1H)</strong>, ela é <strong>fixada automaticamente</strong> aqui e fica em <strong>Aguardando</strong> até o <strong>1M</strong> entrar em SV/SC oposto.
                </p>
                <div className="space-y-2">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2.5 flex items-start gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0 mt-0.5 shadow-[0_0_6px_rgba(251,191,36,0.8)]"></div>
                    <div>
                      <div className="font-bold text-amber-400 text-xs">Aguardando (Auto-fixada)</div>
                      <div className="text-[11px] text-text-dim mt-0.5">
                        Moeda tocou SV/SC no 1H e aguarda o 1M entrar no extremo oposto (SC ou SV).
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded p-2.5 flex items-start gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#10B981] shrink-0 mt-0.5 shadow-[0_0_6px_rgba(16,185,129,0.8)]"></div>
                    <div>
                      <div className="font-bold text-[#10B981] text-xs">Sinal LONG = 1H em SC + 1M em SV (≤ 30)</div>
                      <div className="text-[11px] text-text-dim mt-0.5">
                        1H tocou Sobrecompra (≥ 70) e o 1M entrou em Sobrevenda (≤ 30).
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded p-2.5 flex items-start gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shrink-0 mt-0.5 shadow-[0_0_6px_rgba(239,68,68,0.8)]"></div>
                    <div>
                      <div className="font-bold text-[#EF4444] text-xs">Sinal SHORT = 1H em SV + 1M em SC (≥ 70)</div>
                      <div className="text-[11px] text-text-dim mt-0.5">
                        1H tocou Sobrevenda (≤ 30) e o 1M entrou em Sobrecompra (≥ 70).
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </h2>
          <div className="flex items-center gap-4 text-[10px] flex-wrap">
            <button
              type="button"
              onClick={handleToggleSound}
              title={
                soundEnabled
                  ? 'Alerta sonoro suave ativado apenas para sinais LONG / SHORT (clique para desativar)'
                  : 'Alerta sonoro desativado (clique para ativar)'
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-accent/15 text-accent border-accent/40 hover:bg-accent/25'
                  : 'bg-surface-light text-text-dim border-border hover:text-text-main'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>Alerta Sonoro: {soundEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <select 
              value={multiFilter}
              onChange={(e) => setMultiFilter(e.target.value)}
              className="bg-surface-light border border-border px-2 py-1 rounded text-xs text-text-main cursor-pointer outline-none focus:border-accent mr-2"
            >
              <option value="Monitoring">Fixadas (Aguardando / Sinais)</option>
              <option value="Signals">Apenas Sinais (LONG / SHORT)</option>
              <option value="LONG">Apenas Sinal LONG (1H SC + 1M SV)</option>
              <option value="SHORT">Apenas Sinal SHORT (1H SV + 1M SC)</option>
              <option value="Waiting">Apenas Aguardando</option>
              <option value="All">Todas as Moedas</option>
            </select>
            <div className="flex items-center gap-1.5" title="Fixada automaticamente após tocar SV/SC no 1H — aguardando 1M oposto">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]"></div>
              <span className="font-semibold text-amber-400">Aguardando</span>
            </div>
            <div className="flex items-center gap-1.5" title="1H em SC (≥ 70) + 1M em SV (≤ 30) = Sinal LONG">
              <div className="w-2.5 h-2.5 rounded-full bg-[#10B981] shadow-[0_0_6px_rgba(16,185,129,0.8)]"></div>
              <span className="font-semibold text-[#10B981]">Sinal LONG (1H SC + 1M SV)</span>
            </div>
            <div className="flex items-center gap-1.5" title="1H em SV (≤ 30) + 1M em SC (≥ 70) = Sinal SHORT">
              <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shadow-[0_0_6px_rgba(239,68,68,0.8)]"></div>
              <span className="font-semibold text-[#EF4444]">Sinal SHORT (1H SV + 1M SC)</span>
            </div>
            <button onClick={() => setShowTable(!showTable)} className="p-1 hover:bg-surface-light rounded transition-colors text-text-dim ml-2">
              {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
        
        {showTable && (
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="text-text-dim border-b border-border">
            <tr>
              <th 
                onClick={() => handleMultiSort('ticker')} 
                className="py-2 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                title="Clique para ordenar por Cripto (A-Z / Z-A)"
              >
                <div className="flex items-center gap-1.5">
                  <span>Cripto</span>
                  {multiSortBy === 'ticker' && (
                    <span className="text-[10px] text-accent font-bold">
                      {multiSortOrder === 'asc' ? '↑ A-Z' : '↓ Z-A'}
                    </span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleMultiSort('signal')} 
                className="py-2 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                title="Clique para ordenar por Status / Sinal"
              >
                <div className="flex items-center gap-1.5">
                  <span>STATUS / SINAL</span>
                  {multiSortBy === 'signal' && (
                    <span className="text-[10px] text-accent font-bold">
                      {multiSortOrder === 'desc' ? '↓' : '↑'}
                    </span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleMultiSort('marketCap')} 
                className="py-2 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                title="Clique para ordenar por Market Cap"
              >
                <div className="flex items-center gap-1.5">
                  <span>Market Cap</span>
                  {multiSortBy === 'marketCap' && (
                    <span className="text-[10px] text-accent font-bold">
                      {multiSortOrder === 'desc' ? '↓' : '↑'}
                    </span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleMultiSort('rsi1h')}
                className="py-2 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                title="Clique para ordenar pelo valor do RSI (1H)"
              >
                <div className="flex items-center gap-1.5">
                  <span>1H</span>
                  {multiSortBy === 'rsi1h' && (
                    <span className="text-[10px] text-accent font-bold">
                      {multiSortOrder === 'desc' ? '↓' : '↑'}
                    </span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleMultiSort('rsi1m')}
                className="py-2 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                title="Clique para ordenar pelo valor do RSI (1M)"
              >
                <div className="flex items-center gap-1.5">
                  <span>1M</span>
                  {multiSortBy === 'rsi1m' && (
                    <span className="text-[10px] text-accent font-bold">
                      {multiSortOrder === 'desc' ? '↓' : '↑'}
                    </span>
                  )}
                </div>
              </th>
              <th className="py-2 px-4 font-semibold uppercase tracking-wider w-8"></th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {multiRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-dim text-xs">
                  Nenhuma moeda fixada ou com sinal no filtro atual. Assim que uma moeda tocar em SV (≤ 30) ou SC (≥ 70) no gráfico de 1H, ela será fixada automaticamente aqui.
                </td>
              </tr>
            ) : (
              multiRows.map((coin, index) => {
                const ticker = coin.ticker;
                const isPinned = pinnedCoins.includes(ticker);
                const { status, signal, liveStatus1h, effective1h, status1m, rsi1h, rsi1m } = coin;

                let rowClasses = "border-b border-border hover:bg-surface-light transition-all cursor-pointer group";
                if (status === 'LONG') {
                  rowClasses = "border-b border-border hover:bg-surface-light border-l-4 border-l-[#10B981] bg-[#10B981]/10 transition-all cursor-pointer group";
                } else if (status === 'SHORT') {
                  rowClasses = "border-b border-border hover:bg-surface-light border-l-4 border-l-[#EF4444] bg-[#EF4444]/10 transition-all cursor-pointer group";
                } else if (status === 'WAITING') {
                  rowClasses = "border-b border-border hover:bg-surface-light border-l-4 border-l-amber-400 bg-amber-500/5 transition-all cursor-pointer group";
                } else if (isPinned) {
                  rowClasses += " border-l-4 border-l-accent";
                }

                return (
                  <tr key={`${ticker}-${coin.id || index}`} className={rowClasses} onClick={() => {
                    if (isPinned) {
                      handleUnpinCoin(ticker);
                    } else {
                      handlePinCoin(ticker);
                    }
                  }}>
                    <td className="py-2.5 px-4 font-sans font-bold flex items-center gap-2">
                      <div className="flex items-center gap-1.5 min-w-[3.5rem]">
                        {isPinned && <Pin size={12} className="text-accent fill-accent rotate-45 shrink-0" />}
                        <span className="text-sm font-extrabold">{ticker}</span>
                      </div>
                      <span className="text-xs text-text-dim font-normal truncate max-w-[120px] hidden sm:inline">
                        {coin.name}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs whitespace-nowrap">
                      {status === 'LONG' ? (
                        <span
                          title={`Sinal LONG: 1H tocou SC (${rsi1h?.toFixed(2)}) e 1M entrou em SV (${rsi1m?.toFixed(2)})`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wide border shadow-sm bg-[#10B981]/20 text-[#10B981] border-[#10B981]/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse"></span>
                          SINAL LONG
                        </span>
                      ) : status === 'SHORT' ? (
                        <span
                          title={`Sinal SHORT: 1H tocou SV (${rsi1h?.toFixed(2)}) e 1M entrou em SC (${rsi1m?.toFixed(2)})`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wide border shadow-sm bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/50 shadow-[0_0_8px_rgba(239,68,68,0.3)]"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse"></span>
                          SINAL SHORT
                        </span>
                      ) : status === 'WAITING' ? (
                        <div className="inline-flex items-center gap-2">
                          <span
                            title={
                              effective1h === 'SC'
                                ? 'Fixada após tocar SC no 1H — aguardando 1M entrar em SV (≤ 30) para Sinal LONG'
                                : 'Fixada após tocar SV no 1H — aguardando 1M entrar em SC (≥ 70) para Sinal SHORT'
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wide border bg-amber-500/15 text-amber-400 border-amber-500/40"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            Aguardando
                          </span>
                          <span className="text-[10px] text-text-dim hidden md:inline">
                            {effective1h === 'SC' ? '1M SV (≤ 30) → LONG' : '1M SC (≥ 70) → SHORT'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-text-dim/30">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-text-dim font-mono">
                      {formatMarketCap(coin.marketCap)}
                    </td>
                    {/* 1H RSI */}
                    <td className="py-2.5 px-4">
                      {rsi1h === null ? (
                        <span className="text-text-dim">-</span>
                      ) : liveStatus1h === 'SC' ? (
                        <span className="inline-flex items-center gap-1.5 text-[#EF4444] font-bold bg-[#EF4444]/15 px-2 py-0.5 rounded border border-[#EF4444]/30 shadow-[0_0_6px_rgba(239,68,68,0.2)]">
                          <span>{rsi1h.toFixed(2)}</span>
                          <span className="text-[9px] uppercase opacity-90">SC</span>
                        </span>
                      ) : liveStatus1h === 'SV' ? (
                        <span className="inline-flex items-center gap-1.5 text-[#10B981] font-bold bg-[#10B981]/15 px-2 py-0.5 rounded border border-[#10B981]/30 shadow-[0_0_6px_rgba(16,185,129,0.2)]">
                          <span>{rsi1h.toFixed(2)}</span>
                          <span className="text-[9px] uppercase opacity-90">SV</span>
                        </span>
                      ) : effective1h ? (
                        <span className="inline-flex items-center gap-1.5 text-text-main">
                          <span>{rsi1h.toFixed(2)}</span>
                          <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded border ${
                            effective1h === 'SC'
                              ? 'text-[#EF4444]/85 bg-[#EF4444]/10 border-[#EF4444]/25'
                              : 'text-[#10B981]/85 bg-[#10B981]/10 border-[#10B981]/25'
                          }`}>
                            tocou {effective1h}
                          </span>
                        </span>
                      ) : (
                        <span className="text-text-main">{rsi1h.toFixed(2)}</span>
                      )}
                    </td>
                    {/* 1M RSI */}
                    <td className="py-2.5 px-4">
                      {rsi1m === null ? (
                        <span className="text-text-dim">-</span>
                      ) : status1m === 'SC' ? (
                        <span className={`inline-flex items-center gap-1.5 text-[#EF4444] font-bold px-2 py-0.5 rounded border ${
                          signal === 'SHORT'
                            ? 'bg-[#EF4444]/25 border-[#EF4444]/60 shadow-[0_0_8px_rgba(239,68,68,0.35)]'
                            : 'bg-[#EF4444]/15 border-[#EF4444]/30'
                        }`}>
                          <span>{rsi1m.toFixed(2)}</span>
                          <span className="text-[9px] uppercase opacity-90">SC</span>
                        </span>
                      ) : status1m === 'SV' ? (
                        <span className={`inline-flex items-center gap-1.5 text-[#10B981] font-bold px-2 py-0.5 rounded border ${
                          signal === 'LONG'
                            ? 'bg-[#10B981]/25 border-[#10B981]/60 shadow-[0_0_8px_rgba(16,185,129,0.35)]'
                            : 'bg-[#10B981]/15 border-[#10B981]/30'
                        }`}>
                          <span>{rsi1m.toFixed(2)}</span>
                          <span className="text-[9px] uppercase opacity-90">SV</span>
                        </span>
                      ) : (
                        <span className="text-text-main">{rsi1m.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {isPinned ? (
                        <button 
                          className="p-1 rounded hover:bg-[rgba(255,255,255,0.1)] text-accent hover:text-white transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnpinCoin(ticker);
                          }}
                          title="Desafixar cripto"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : (
                        <button 
                          className="p-1 rounded hover:bg-[rgba(255,255,255,0.1)] text-text-dim/30 hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePinCoin(ticker);
                          }}
                          title="Fixar no topo"
                        >
                          <Pin className="w-3.5 h-3.5 rotate-45" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-auto pt-4 flex justify-between items-center text-[9px] text-text-dim border-t border-border">
        <p>Data provided by CoinGecko & Binance</p>
        {lastUpdated && <p>Last updated: <span className="text-accent">{lastUpdated.toLocaleTimeString()}</span></p>}
      </footer>
      </main>
      
      {selectedCoin && (
        <CoinHistoryModal 
          coin={selectedCoin} 
          onClose={() => setSelectedCoin(null)} 
        />
      )}
      </>
      ) : activeTab === 'dashboard' ? (
        <Dashboard />
      ) : activeTab === 'evolution' ? (
        <Evolution />
      ) : activeTab === 'risk' ? (
        <RiskCalculator />
      ) : activeTab === 'journal' ? (
        <TradeJournal />
      ) : activeTab === 'strategy' ? (
        <Strategy />
      ) : (
        <IrpfForm />
      )}
    </div>
  );
}
