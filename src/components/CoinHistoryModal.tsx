import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { X, Loader2 } from 'lucide-react';

interface CoinHistoryModalProps {
  coin: {
    symbol: string;
    ticker: string;
    name: string;
  };
  onClose: () => void;
}

export function CoinHistoryModal({ coin, onClose }: CoinHistoryModalProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<string>('1d');
  const [years, setYears] = useState<number>(2);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/crypto-history?symbol=${coin.ticker}&years=${years}&timeframe=${timeframe}`);
        if (!res.ok) throw new Error('Failed to fetch history');
        const data = await res.json();
        
        // Format dates based on timeframe
        const formatted = data.history.map((d: any) => {
          const date = new Date(d.date);
          const isHourly = timeframe.includes('h');
          return {
            ...d,
            formattedDate: isHourly 
              ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' })
              : date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            fullDate: isHourly
              ? date.toLocaleString()
              : date.toLocaleDateString()
          };
        });

        setHistory(formatted);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [coin, timeframe, years]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl relative">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 border-b border-border gap-4">
          <div>
            <h2 className="text-2xl font-bold">{coin.name} ({coin.ticker})</h2>
            <p className="text-text-dim text-sm">Historical RSI Chart</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-bg rounded-lg border border-border p-1">
              <button 
                onClick={() => { setTimeframe('1h'); setYears(0.5); }} // 1h is heavy, default to 6 months
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${timeframe === '1h' ? 'bg-surface border border-border text-accent' : 'text-text-dim hover:text-text-main'}`}
              >
                1H
              </button>
              <button 
                onClick={() => { setTimeframe('4h'); setYears(1); }} // 1 yr
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${timeframe === '4h' ? 'bg-surface border border-border text-accent' : 'text-text-dim hover:text-text-main'}`}
              >
                4H
              </button>
              <button 
                onClick={() => { setTimeframe('1d'); setYears(2); }} // 2 yr
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${timeframe === '1d' ? 'bg-surface border border-border text-accent' : 'text-text-dim hover:text-text-main'}`}
              >
                1D
              </button>
              <button 
                onClick={() => { setTimeframe('1w'); setYears(5); }} // 5 yr
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${timeframe === '1w' ? 'bg-surface border border-border text-accent' : 'text-text-dim hover:text-text-main'}`}
              >
                1W
              </button>
            </div>
          
            <button 
              onClick={onClose}
              className="p-2 hover:bg-surface-light rounded-full transition-colors text-text-dim hover:text-text-main ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 relative min-h-0 flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <p className="text-text-dim animate-pulse">Loading {timeframe} history...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center text-red-400">
              {error}
            </div>
          ) : history.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-text-dim">
              Not enough historical data available.
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis 
                    dataKey="formattedDate" 
                    tick={{ fill: 'var(--color-text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    tickLine={{ stroke: 'var(--color-border)' }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    minTickGap={50}
                  />
                  <YAxis 
                    domain={[0, 100]}
                    ticks={[0, 10, 20, 30, 50, 70, 80, 90, 100]}
                    tick={{ fill: 'var(--color-text-dim)', fontSize: 13, fontWeight: '500', fontFamily: 'var(--font-mono)' }}
                    tickLine={{ stroke: 'var(--color-border)' }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--color-text-main)' }}
                    labelStyle={{ color: 'var(--color-accent)', marginBottom: '4px', fontWeight: 'bold' }}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate || label}
                  />
                  
                  {/* Reference lines for Overbought / Oversold */}
                  <ReferenceLine y={90} stroke="#7F1D1D" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Max Overbought (90)', fill: '#7F1D1D', fontSize: 10 }} />
                  <ReferenceLine y={80} stroke="#B91C1C" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Strong Overbought (80)', fill: '#B91C1C', fontSize: 10 }} />
                  <ReferenceLine y={70} stroke="#EF4444" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Overbought (70)', fill: '#EF4444', fontSize: 10 }} />
                  
                  <ReferenceLine y={30} stroke="#10B981" strokeDasharray="3 3" label={{ position: 'insideBottomLeft', value: 'Oversold (30)', fill: '#10B981', fontSize: 10 }} />
                  <ReferenceLine y={20} stroke="#047857" strokeDasharray="3 3" label={{ position: 'insideBottomLeft', value: 'Strong Oversold (20)', fill: '#047857', fontSize: 10 }} />
                  <ReferenceLine y={10} stroke="#064E3B" strokeDasharray="3 3" label={{ position: 'insideBottomLeft', value: 'Max Oversold (10)', fill: '#064E3B', fontSize: 10 }} />
                  
                  <Line 
                    type="monotone" 
                    dataKey="rsi" 
                    stroke="#3B82F6" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 6, fill: '#3B82F6' }}
                    name="Daily RSI (14)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
