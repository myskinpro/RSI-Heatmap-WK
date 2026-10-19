import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine, Cell, ZAxis } from 'recharts';
import { RefreshCw, TrendingUp, ChevronUp, ChevronDown, BarChart2, HelpCircle, User, X, Pin } from 'lucide-react';
import axios from 'axios';
import { CoinHistoryModal } from './components/CoinHistoryModal';
import { Dashboard } from './components/Dashboard';
import { IrpfForm } from './components/IrpfForm';
import Evolution from './components/Evolution';
import RiskCalculator from './components/RiskCalculator';
import TradeJournal from './components/TradeJournal';
import Strategy from './components/Strategy';
import { OrderBlockRadar } from './components/OrderBlockRadar';

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
  smc?: any;
}

const ZONES = [
  { name: 'Overbought', min: 70, max: 100, color: '#EF4444', fill: 'rgba(239, 68, 68, 0.15)' },
  { name: 'Neutral', min: 30, max: 70, color: '#6B7280', fill: 'rgba(107, 114, 128, 0.08)' },
  { name: 'Oversold', min: 0, max: 30, color: '#10B981', fill: 'rgba(16, 185, 129, 0.15)' }
];

const TIMEFRAMES = [
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1d', value: '1d' }
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

export interface TimeframeAlert {
  tf: string;
  type: 'SV' | 'SC';
  rsi: number;
}

export function getTimeframeAlerts(tfs: Record<string, CryptoData> | undefined): TimeframeAlert[] {
  if (!tfs) return [];
  // Order from largest to smallest timeframe (1D down to 5M)
  const timeframes = ['1d', '4h', '1h', '30m', '15m', '5m'];
  const alerts: TimeframeAlert[] = [];

  for (const tf of timeframes) {
    const item = tfs[tf];
    if (item && typeof item.rsi === 'number') {
      if (item.rsi <= 30) {
        alerts.push({ tf: tf.toUpperCase(), type: 'SV', rsi: item.rsi });
      } else if (item.rsi >= 70) {
        alerts.push({ tf: tf.toUpperCase(), type: 'SC', rsi: item.rsi });
      }
    }
  }

  return alerts;
}

export default function App() {
  const [data, setData] = useState<CryptoData[]>([]);
  const [multiData, setMultiData] = useState<Record<string, Record<string, CryptoData>>>({});
  const [pinnedCoins, setPinnedCoins] = useState<string[]>([]);
  const dismissedCoinsRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('4h');
  const [limit, setLimit] = useState(100);
  const [minMarketCap, setMinMarketCap] = useState(0); // All default
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [multiFilter, setMultiFilter] = useState('Alerts');
  const [multiSortBy, setMultiSortBy] = useState<'ticker' | 'timeframe' | 'marketCap'>('timeframe');
  const [multiSortOrder, setMultiSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showScatter, setShowScatter] = useState(true);

  const handleMultiSort = (column: 'ticker' | 'timeframe' | 'marketCap') => {
    if (multiSortBy === column) {
      setMultiSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setMultiSortBy(column);
      setMultiSortOrder(column === 'marketCap' || column === 'timeframe' ? 'desc' : 'asc');
    }
  };
  const [showTable, setShowTable] = useState(true);
  const [activeTab, setActiveTab] = useState<'heatmap' | 'dashboard' | 'irpf' | 'evolution' | 'risk' | 'journal' | 'strategy'>('heatmap');
  
  const [selectedCoin, setSelectedCoin] = useState<CryptoData | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const tfsToFetch = ['5m', '15m', '30m', '1h', '4h', '1d'];
      if (!tfsToFetch.includes(timeframe)) tfsToFetch.push(timeframe);

      const responses = [];
      for (const tf of tfsToFetch) {
        try {
          const res = await axios.get('/api/crypto-rsi', { 
            params: { timeframe: tf, limit, minMarketCap }, 
            timeout: 60000 
          });
          responses.push(res);
        } catch(e) {
          responses.push({ data: [] });
        }
      }

      const newMulti: Record<string, Record<string, CryptoData>> = {};
      let selectedData: CryptoData[] = [];

      responses.forEach((res, i) => {
        const tf = tfsToFetch[i];
        if (Array.isArray(res.data)) {
           res.data.forEach((coin: CryptoData) => {
             if (!coin) return;
             if (!newMulti[coin.ticker]) newMulti[coin.ticker] = {};
             newMulti[coin.ticker][tf] = coin;
           });
           if (tf === timeframe) {
              selectedData = res.data.filter(c => c != null);
           }
        }
      });

      setData(selectedData);
      setMultiData(newMulti);
      setLastUpdated(new Date());
    } catch (error: any) {
      console.error("Failed to fetch data:", error.message);
      setData([]); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Auto-refresh every 1 minute
    return () => clearInterval(interval);
  }, [timeframe, limit, minMarketCap]);

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
            <span className="text-text-dim">RSI (14)</span>
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
                  <option value={1000000000}>$1B+</option>
                  <option value={5000000000}>$5B+</option>
                  <option value={10000000000}>$10B+</option>
                  <option value={50000000000}>$50B+</option>
                  <option value={100000000000}>$100B+</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-text-dim tracking-wider">Timeframe</label>
                <select 
                  value={timeframe} 
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="bg-surface-light border border-border px-4 py-2 rounded-full text-sm text-text-main cursor-pointer outline-none focus:border-accent"
                >
                  {TIMEFRAMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
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
              RSI Distribution
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-text-dim uppercase tracking-wider flex items-center gap-2">
            Multi-Timeframe
            <div className="group relative flex items-center">
              <HelpCircle size={14} className="text-text-dim/50 hover:text-text-main cursor-help transition-colors" />
              <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-[#1a1a1b] shadow-2xl border border-border rounded-lg p-4 text-xs font-normal text-text-dim opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100]">
                <div className="mb-2 font-bold text-text-main text-sm">Monitoramento Multi-Timeframe</div>
                <p className="text-xs text-text-dim leading-relaxed mb-3">
                  Acompanhamento simultâneo do RSI (14) nos tempos gráficos 5M, 15M, 30M, 1H, 4H e 1D.
                </p>
                <div className="space-y-2">
                  <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded p-2.5 flex items-start gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#10B981] shrink-0 mt-0.5 shadow-[0_0_6px_rgba(16,185,129,0.8)]"></div>
                    <div>
                      <div className="font-bold text-[#10B981] text-xs">SV - Sobrevendido (RSI ≤ 30)</div>
                      <div className="text-[11px] text-text-dim mt-0.5">
                        Sinal de sobrevenda. O timeframe é destacado em <span className="text-[#10B981] font-semibold">verde</span> na coluna TIMEFRAME.
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded p-2.5 flex items-start gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shrink-0 mt-0.5 shadow-[0_0_6px_rgba(239,68,68,0.8)]"></div>
                    <div>
                      <div className="font-bold text-[#EF4444] text-xs">SC - Sobrecomprado (RSI ≥ 70)</div>
                      <div className="text-[11px] text-text-dim mt-0.5">
                        Sinal de sobrecompra. O timeframe é destacado em <span className="text-[#EF4444] font-semibold">vermelho</span> na coluna TIMEFRAME.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </h2>
          <div className="flex items-center gap-4 text-[10px]">
            <select 
              value={multiFilter}
              onChange={(e) => setMultiFilter(e.target.value)}
              className="bg-surface-light border border-border px-2 py-1 rounded text-xs text-text-main cursor-pointer outline-none focus:border-accent mr-2"
            >
              <option value="All">Todas as Moedas</option>
              <option value="Alerts">Com Alerta (SV ou SC)</option>
              <option value="SV">Apenas Sobrevendido (SV ≤ 30)</option>
              <option value="SC">Apenas Sobrecomprado (SC ≥ 70)</option>
            </select>
            <div className="flex items-center gap-1.5" title="Sobrevendido: RSI ≤ 30">
              <div className="w-2.5 h-2.5 rounded-full bg-[#10B981] shadow-[0_0_6px_rgba(16,185,129,0.8)]"></div>
              <span className="font-semibold text-[#10B981]">SV ≤ 30</span>
            </div>
            <div className="flex items-center gap-1.5" title="Sobrecomprado: RSI ≥ 70">
              <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shadow-[0_0_6px_rgba(239,68,68,0.8)]"></div>
              <span className="font-semibold text-[#EF4444]">SC ≥ 70</span>
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
                onClick={() => handleMultiSort('timeframe')} 
                className="py-2 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                title="Clique para ordenar por Timeframe (Maior → Menor)"
              >
                <div className="flex items-center gap-1.5">
                  <span>TIMEFRAME</span>
                  {multiSortBy === 'timeframe' && (
                    <span className="text-[10px] text-accent font-bold">
                      {multiSortOrder === 'desc' ? '↓ 1D→5M' : '↑ 5M→1D'}
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
              <th className="py-2 px-4 font-semibold uppercase tracking-wider">5M</th>
              <th className="py-2 px-4 font-semibold uppercase tracking-wider">15M</th>
              <th className="py-2 px-4 font-semibold uppercase tracking-wider">30M</th>
              <th className="py-2 px-4 font-semibold uppercase tracking-wider">1H</th>
              <th className="py-2 px-4 font-semibold uppercase tracking-wider">4H</th>
              <th className="py-2 px-4 font-semibold uppercase tracking-wider">1D</th>
              <th className="py-2 px-4 font-semibold uppercase tracking-wider w-8"></th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {data.map(coin => {
              const ticker = coin.ticker;
              const tfs = multiData[ticker] || {};
              const alerts = getTimeframeAlerts(tfs);
              const hasSV = alerts.some(a => a.type === 'SV');
              const hasSC = alerts.some(a => a.type === 'SC');

              return {
                ...coin,
                tfs,
                alerts,
                hasSV,
                hasSC
              };
            }).filter(coin => {
              const ticker = coin.ticker;
              const isPinned = pinnedCoins.includes(ticker);
              if (isPinned) return true; // Always show pinned coins
              if (multiFilter === 'All') return true;
              if (multiFilter === 'Alerts') return coin.alerts.length > 0;
              if (multiFilter === 'SV') return coin.hasSV;
              if (multiFilter === 'SC') return coin.hasSC;
              return true;
            }).sort((a, b) => {
              const aPinned = pinnedCoins.includes(a.ticker);
              const bPinned = pinnedCoins.includes(b.ticker);
              if (aPinned && !bPinned) return -1;
              if (!aPinned && bPinned) return 1;

              if (multiSortBy === 'timeframe') {
                const TF_ORDER: Record<string, number> = { '1D': 6, '4H': 5, '1H': 4, '30M': 3, '15M': 2, '5M': 1 };
                const maxLen = Math.max(a.alerts.length, b.alerts.length);
                for (let i = 0; i < maxLen; i++) {
                  const weightA = a.alerts[i] ? (TF_ORDER[a.alerts[i].tf] || 0) : 0;
                  const weightB = b.alerts[i] ? (TF_ORDER[b.alerts[i].tf] || 0) : 0;
                  if (weightA !== weightB) {
                    return multiSortOrder === 'desc' ? weightB - weightA : weightA - weightB;
                  }
                }
                return a.ticker.localeCompare(b.ticker);
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
            }).map((coin) => {
              const ticker = coin.ticker;
              const tfs = coin.tfs;
              const isPinned = pinnedCoins.includes(ticker);
              const { alerts, hasSV, hasSC } = coin;

              let rowClasses = "border-b border-border hover:bg-surface-light transition-all cursor-pointer group";
              if (hasSV && !hasSC) {
                rowClasses = "border-b border-border hover:bg-surface-light border-l-4 border-l-[#10B981] bg-[#10B981]/5 transition-all cursor-pointer group";
              } else if (hasSC && !hasSV) {
                rowClasses = "border-b border-border hover:bg-surface-light border-l-4 border-l-[#EF4444] bg-[#EF4444]/5 transition-all cursor-pointer group";
              } else if (hasSV && hasSC) {
                rowClasses = "border-b border-border hover:bg-surface-light border-l-4 border-l-amber-500 bg-amber-500/5 transition-all cursor-pointer group";
              } else if (isPinned) {
                rowClasses += " border-l-4 border-l-accent";
              }

              return (
                <tr key={ticker} className={rowClasses} onClick={() => {
                  setPinnedCoins(prev => {
                    if (prev.includes(ticker)) return prev.filter(p => p !== ticker);
                    return [...prev, ticker];
                  });
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
                    {alerts.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {alerts.map((alert, idx) => (
                          <span
                            key={idx}
                            title={`${alert.tf}: RSI ${alert.rsi.toFixed(2)} (${alert.type === 'SV' ? 'Sobrevendido ≤ 30' : 'Sobrecomprado ≥ 70'})`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wide border shadow-sm ${
                              alert.type === 'SV'
                                ? 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]/50 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                                : 'bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/50 shadow-[0_0_8px_rgba(239,68,68,0.25)]'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${alert.type === 'SV' ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`}></span>
                            {alert.tf}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-dim/30">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-text-dim font-mono">
                    {formatMarketCap(coin.marketCap)}
                  </td>
                  {['5m', '15m', '30m', '1h', '4h', '1d'].map(tf => {
                    const item = tfs[tf];
                    if (!item || item.rsi === undefined || item.rsi === null) return <td key={tf} className="py-2.5 px-4 text-text-dim">-</td>;
                    
                    let rsiEl = <span className="text-text-main">{item.rsi.toFixed(2)}</span>;
                    
                    if (item.rsi >= 70) {
                      rsiEl = (
                        <span className="text-[#EF4444] font-bold bg-[#EF4444]/15 px-2 py-0.5 rounded border border-[#EF4444]/30 shadow-[0_0_6px_rgba(239,68,68,0.2)]">
                          {item.rsi.toFixed(2)}
                        </span>
                      );
                    } else if (item.rsi <= 30) {
                      rsiEl = (
                        <span className="text-[#10B981] font-bold bg-[#10B981]/15 px-2 py-0.5 rounded border border-[#10B981]/30 shadow-[0_0_6px_rgba(16,185,129,0.2)]">
                          {item.rsi.toFixed(2)}
                        </span>
                      );
                    }

                    return (
                      <td key={tf} className="py-2.5 px-4">
                        {rsiEl}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-4 text-right">
                    {isPinned ? (
                      <button 
                        className="p-1 rounded hover:bg-[rgba(255,255,255,0.1)] text-accent hover:text-white transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPinnedCoins(prev => prev.filter(p => p !== ticker));
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
                          setPinnedCoins(prev => [...prev, ticker]);
                        }}
                        title="Fixar no topo"
                      >
                        <Pin className="w-3.5 h-3.5 rotate-45" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>

      {/* Radar Order Block & FVG (SMC) */}
      <OrderBlockRadar
        data={data as any}
        multiData={multiData as any}
        pinnedCoins={pinnedCoins}
        setPinnedCoins={setPinnedCoins}
        onSelectCoin={setSelectedCoin}
      />

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
