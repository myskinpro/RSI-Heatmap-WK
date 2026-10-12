import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, RefreshCw, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import axios from 'axios';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const MonthPicker = ({ selected, onSelect }: { selected?: DateRange, onSelect: (range: DateRange) => void }) => {
  const [year, setYear] = useState(selected?.from ? selected.from.getFullYear() : new Date().getFullYear());
  
  const months = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];

  return (
    <div className="p-3 w-[260px] text-sm select-none">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-border/50">
        <button onClick={() => setYear(y => y - 1)} className="p-1.5 hover:bg-surface-light rounded-md text-text-dim hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="font-bold tracking-wide">{year}</div>
        <button onClick={() => setYear(y => y + 1)} className="p-1.5 hover:bg-surface-light rounded-md text-text-dim hover:text-white transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {months.map((m, index) => {
          const isSelected = selected?.from && selected.from.getMonth() === index && selected.from.getFullYear() === year;
          return (
            <button
              key={m}
              onClick={() => {
                const start = new Date(year, index, 1);
                const end = new Date(year, index + 1, 0);
                onSelect({ from: start, to: end });
              }}
              className={`p-2 rounded-md text-center transition-colors font-medium border ${isSelected ? 'bg-accent/20 border-accent/50 text-accent' : 'bg-surface-light border-transparent hover:border-border text-text-dim hover:text-white'}`}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface TradeReport {
  totalPnl: number;
  totalFees: number;
  totalFunding: number;
  winRate: number;
  profitFactor: number;
  winningTrades: number;
  losingTrades: number;
  daysAnalyzed: number;
  trades: Array<{
    symbol: string;
    pnl: number;
    fees: number;
    funding: number;
    openTime: number;
    closeTime: number;
    tradeCount: number;
    leverage?: number;
  }>;
}

export function Dashboard() {
  const [timeRange, setTimeRange] = useState<'Hoje' | 'Mês' | 'Custom'>('Hoje');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<TradeReport | null>(null);
  const [usdToBrl, setUsdToBrl] = useState<number | null>(null);
  
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('BINANCE_API_KEY') || '');
  const [customApiSecret, setCustomApiSecret] = useState(() => localStorage.getItem('BINANCE_API_SECRET') || '');

  useEffect(() => {
    // Fetch USD to BRL exchange rate
    axios.get('https://economia.awesomeapi.com.br/last/USD-BRL')
      .then(response => {
        if (response.data?.USDBRL?.ask) {
          setUsdToBrl(parseFloat(response.data.USDBRL.ask));
        }
      })
      .catch(err => console.error('Failed to fetch exchange rate:', err));
  }, []);

  // Close calendar when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = Date.now();
      let startTime = now;
      let endTime = now;

      if (timeRange === 'Hoje') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startTime = today.getTime();
        endTime = today.getTime() + 24 * 60 * 60 * 1000 - 1;
      } else if (timeRange === 'Mês') {
        const firstDayOfMonth = new Date();
        firstDayOfMonth.setDate(1);
        firstDayOfMonth.setHours(0, 0, 0, 0);
        startTime = firstDayOfMonth.getTime();
        const lastDayOfMonth = new Date(firstDayOfMonth.getFullYear(), firstDayOfMonth.getMonth() + 1, 0);
        lastDayOfMonth.setHours(23, 59, 59, 999);
        endTime = lastDayOfMonth.getTime();
      } else if (timeRange === 'Custom') {
        if (dateRange?.from) {
          const start = new Date(dateRange.from);
          start.setHours(0, 0, 0, 0);
          startTime = start.getTime();
        } else {
          // If no date selected but click generate, fallback to today
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          startTime = today.getTime();
        }
        
        if (dateRange?.to) {
          const end = new Date(dateRange.to);
          end.setHours(23, 59, 59, 999);
          endTime = end.getTime();
        } else if (dateRange?.from) {
          // If only from date is selected, use it as the end date too
          const end = new Date(dateRange.from);
          end.setHours(23, 59, 59, 999);
          endTime = end.getTime();
        }
      }

      let allIncome: any[] = [];
      let seenIncomeIds = new Set();
      let currentStartTime = startTime;
      const maxWaitFrames = 50;

      const signatureFn = async (qs: string) => {
        if (customApiKey && customApiSecret) {
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey(
            'raw',
            enc.encode(customApiSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const signature = await crypto.subtle.sign('HMAC', key, enc.encode(qs));
          return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
        } else {
          const res = await axios.get('/api/binance-auth', { params: { qs } });
          return res.data.signature;
        }
      };

      let mainApiKey = customApiKey;
      if (!mainApiKey) {
        const apiKeyRes = await axios.get('/api/binance-auth', { params: { qs: 'test=1' } });
        mainApiKey = apiKeyRes.data.apiKey;
      }

      for (let i = 0; i < maxWaitFrames; i++) {
        const timestamp = Date.now();
        let chunkEndTime = Math.min(currentStartTime + 29 * 24 * 60 * 60 * 1000, endTime);
        const qs = `startTime=${currentStartTime}&endTime=${chunkEndTime}&limit=1000&timestamp=${timestamp}`;
        
        const signature = await signatureFn(qs);

        const response = await axios.get(`https://fapi.binance.com/fapi/v1/income?${qs}&signature=${signature}`, {
          headers: {
            'X-MBX-APIKEY': mainApiKey
          }
        });
        
        const pageData = response.data;
        if (!Array.isArray(pageData) || pageData.length === 0) {
          if (chunkEndTime >= endTime) break;
          currentStartTime = chunkEndTime + 1;
          continue;
        }
        for (const t of pageData) {
          if (!seenIncomeIds.has(t.tranId)) {
            seenIncomeIds.add(t.tranId);
            allIncome.push(t);
          }
        }
        
        if (pageData.length < 1000) {
          if (chunkEndTime >= endTime) break;
          currentStartTime = chunkEndTime + 1;
        } else {
          currentStartTime = pageData[pageData.length - 1].time; // exact time to avoid miss
        }
      }

      const data = allIncome;
      
      let leverageMap = new Map<string, number>();
      try {
        const timestamp = Date.now();
        const qs = `timestamp=${timestamp}`;
        const signature = await signatureFn(qs);
        const posRisk = await axios.get(`https://fapi.binance.com/fapi/v2/positionRisk?${qs}&signature=${signature}`, {
          headers: { 'X-MBX-APIKEY': mainApiKey }
        });
        posRisk.data.forEach((p: any) => {
          if (p.leverage) {
            leverageMap.set(p.symbol, parseInt(p.leverage));
          }
        });
      } catch (err) {
        console.warn("Could not fetch position risk", err);
      }
      
      let totalPnl = 0;
      let totalFees = 0;
      let totalFunding = 0;
      let winningTrades = 0;
      let losingTrades = 0;

      data.sort((a: any, b: any) => a.time - b.time);

      data.forEach((item: any) => {
        const val = parseFloat(item.income);
        if (item.incomeType === 'COMMISSION') totalFees += val;
        else if (item.incomeType === 'FUNDING_FEE') totalFunding += val;
        else if (item.incomeType === 'REALIZED_PNL') {
            totalPnl += val;
        }
      });

      const fetchUserTrades = async (symbol: string, start: number, end: number, key: string, signFn: any) => {
        let uTrades: any[] = [];
        let seenIds = new Set();
        let currStart = start;
        // avoid infinite loop
        let safety = 0;
        while (currStart <= end && safety < 100) {
          safety++;
          let currEnd = Math.min(currStart + 6 * 24 * 60 * 60 * 1000, end);
          let timestamp = Date.now();
          const q = `symbol=${symbol}&startTime=${currStart}&endTime=${currEnd}&limit=1000&timestamp=${timestamp}`;
          const sig = await signFn(q);
          const r = await axios.get(`https://fapi.binance.com/fapi/v1/userTrades?${q}&signature=${sig}`, {
            headers: { 'X-MBX-APIKEY': key }
          });
          const chunk = r.data;
          if (!chunk || chunk.length === 0) {
            currStart = currEnd + 1;
            continue;
          }
          for (const t of chunk) {
            if (!seenIds.has(t.id)) {
              seenIds.add(t.id);
              uTrades.push(t);
            }
          }
          if (chunk.length === 1000) {
            currStart = chunk[chunk.length - 1].time; // Do NOT add 1 to avoid missing trades on the exact same millisecond
          } else {
            currStart = currEnd + 1;
          }
        }
        return uTrades;
      };

      const trades: Array<{
        symbol: string;
        pnl: number;
        fees: number;
        funding: number;
        openTime: number;
        closeTime: number;
        tradeCount: number;
        leverage?: number | string | null;
      }> = [];

      const symbolsList = Array.from(new Set(data.filter((i:any) => i.incomeType === 'REALIZED_PNL' && i.symbol && i.symbol !== 'OTHER').map((i:any) => i.symbol)));

      // Fetch user trades for all symbols in chunks
      // We will do it sequentially to prevent limit issues since we have maxWaitFrames in the outer function anyway, 
      // but let's do it efficiently.
      for (const sym of symbolsList) {
        const symIncome = data.filter((i:any) => i.symbol === sym);
        if (symIncome.length === 0) continue;
        
        // Fetch up to 90 days before the first income event to catch the open order
        const symStart = Math.min(...symIncome.map((i:any) => i.time)) - 90 * 24 * 60 * 60 * 1000; 
        const symEnd = Math.min(endTime, Math.max(...symIncome.map((i:any) => i.time)) + 24 * 60 * 60 * 1000); // add a day
        
        const uTrades = await fetchUserTrades(sym as string, symStart, symEnd, mainApiKey, signatureFn);
        if (!uTrades || uTrades.length === 0) continue;

        const tradesByPosSide: Record<string, any[]> = {};
        for (const t of uTrades) {
          const pSide = t.positionSide || 'BOTH';
          if (!tradesByPosSide[pSide]) tradesByPosSide[pSide] = [];
          tradesByPosSide[pSide].push(t);
        }

        for (const [pSide, sideTrades] of Object.entries(tradesByPosSide)) {
          let posQty = 0;
          let pOpenTime = 0;
          let pCloseTime = 0;
          let pPnl = 0;
          let pFees = 0;
          let pCount = 0;
          let lastRealizedTime = 0;

          for (const t of sideTrades) {
            const qty = parseFloat(t.qty);
            const p = parseFloat(t.realizedPnl);
            const c = parseFloat(t.commission);

            // In hedge mode, BUY opens LONG and closes SHORT, SELL opens SHORT and closes LONG
            // Wait, t.side indicates the actual trade side.
            // If positionSide is SHORT, a SELL order INCREASES the short (more negative position).
            // A BUY order DECREASES the short (less negative position).
            // This is identical to our BUY = +qty and SELL = -qty logic!
            const qtyChange = t.side === 'BUY' ? qty : -qty;

            if (Math.abs(posQty) < 1e-8) {
              // Opening position
              pOpenTime = t.time;
              pPnl = p;
              pFees = -c; // since commissionAsset is USDT, usually reported as positive string, we subtract
              pCount = 1;
              posQty = qtyChange;
              lastRealizedTime = t.time;
            } else {
              const oldQty = posQty;
              const newQty = posQty + qtyChange;
              
              pPnl += p;
              pFees -= c;
              pCount++;
              lastRealizedTime = t.time;
              
              // Check if position was closed or flipped
              if (Math.abs(newQty) < 1e-8 || (oldQty > 1e-8 && newQty < -1e-8) || (oldQty < -1e-8 && newQty > 1e-8)) {
                // Position closed or flipped. Record the trade.
                const funding = data.filter((i:any) => i.symbol === sym && i.incomeType === 'FUNDING_FEE' && i.time >= pOpenTime && i.time <= lastRealizedTime)
                                    .reduce((s:number, i:any) => s + parseFloat(i.income), 0);
                trades.push({
                   symbol: pSide === 'BOTH' ? sym as string : `${sym} (${pSide})`,
                   pnl: pPnl,
                   fees: pFees,
                   funding: funding,
                   openTime: pOpenTime,
                   closeTime: lastRealizedTime,
                   tradeCount: pCount,
                   leverage: leverageMap.get(sym as string)
                });
                
                posQty = newQty;
                if (Math.abs(posQty) >= 1e-8) {
                  // Flipped: Start a new position
                  pOpenTime = t.time;
                  pPnl = 0; // The realized PNL belonged to the closed portion
                  pFees = 0; // Fees applied to the closing trade
                  pCount = 1;
                } else {
                  pPnl = 0;
                  pFees = 0;
                  pCount = 0;
                }
              } else {
                posQty = newQty;
              }
            }
          }
        }
      }

      // Only include trades that closed within the selected period
      const filteredTrades = trades.filter(t => t.closeTime >= startTime && t.closeTime <= endTime);

      totalPnl = filteredTrades.reduce((sum, t) => sum + t.pnl, 0);
      totalFees = filteredTrades.reduce((sum, t) => sum + t.fees, 0);
      totalFunding = filteredTrades.reduce((sum, t) => sum + t.funding, 0);

      winningTrades = filteredTrades.filter(t => (t.pnl + t.fees + t.funding) > 0).length;
      losingTrades = filteredTrades.filter(t => (t.pnl + t.fees + t.funding) <= 0).length;

      const totalTrades = winningTrades + losingTrades;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      
      let netProfit = 0;
      let netLoss = 0;
      filteredTrades.forEach(t => {
        const netCalc = t.pnl + t.fees + t.funding;
        if (netCalc > 0) netProfit += netCalc;
        else if (netCalc < 0) netLoss += Math.abs(netCalc);
      });
      
      const profitFactor = netLoss > 0 ? netProfit / netLoss : (netProfit > 0 ? 999 : 0);

      filteredTrades.sort((a, b) => b.closeTime - a.closeTime);

      const computedEndTime = Math.min(endTime, Date.now());
      const daysAnalyzed = Math.max(1, Math.ceil((computedEndTime - startTime) / (1000 * 60 * 60 * 24)));

      setReport({ totalPnl, totalFees, totalFunding, winRate, profitFactor, winningTrades, losingTrades, daysAnalyzed, trades: filteredTrades });
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Error parsing data');
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (val: number) => {
    const sign = val > 0 ? '+' : '';
    // Format properly based on size
    if (Math.abs(val) < 0.01 && val !== 0) {
      return `${sign}$${val.toFixed(4)}`;
    }
    return `${sign}$${val.toFixed(2)}`;
  };

  const formatDuration = (openTime: number, closeTime: number) => {
    const diffMs = Math.abs(closeTime - openTime);
    if (diffMs === 0) return "0:00h";
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}:${minutes.toString().padStart(2, '0')}h`;
  };

  const formatDate = (timestamp: number) => {
    return format(new Date(timestamp), "dd/MM/yyyy HH:mm");
  };

  const totalNet = report ? report.totalPnl + report.totalFees + report.totalFunding : 0;
  const avgPerDay = report ? totalNet / Math.max(1, report.daysAnalyzed) : 0;
  
  let daysInMonth = 30;
  if (timeRange === 'Custom' && dateRange?.from) {
    const start = new Date(dateRange.from);
    daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  } else {
    const today = new Date();
    daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  }

  const projMonth = avgPerDay * daysInMonth;

  return (
    <div className="flex-1 flex flex-col w-full">
      <div className="px-6 py-3 flex flex-col items-end border-b border-border bg-surface">
        <div className="flex flex-wrap items-center gap-6">

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase text-text-dim tracking-wider">Período</label>
            <div className="bg-surface-light border border-border rounded-full p-0.5 flex items-center">
              {['Hoje', 'Mês', 'Custom'].map(t => (
                <button 
                  key={t}
                  onClick={() => setTimeRange(t as any)}
                  className={`text-xs px-4 py-1.5 rounded-full font-medium transition-colors ${timeRange === t ? 'bg-border text-text-main' : 'text-text-dim hover:text-text-main'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {timeRange === 'Custom' && (
            <div className="flex flex-col gap-1 relative" ref={calendarRef}>
              <label className="text-[10px] uppercase text-text-dim tracking-wider">Data Personalizada</label>
              <div 
                className="flex items-center gap-2 bg-surface-light border border-border rounded-full py-2 px-4 cursor-pointer hover:bg-border transition-colors text-text-main text-sm"
                onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              >
                <CalendarIcon className="w-4 h-4 text-text-dim" />
                <span>
                  {dateRange?.from ? (
                    <span className="capitalize">{format(dateRange.from, "MMMM yyyy", { locale: ptBR })}</span>
                  ) : (
                    "Selecione um mês"
                  )}
                </span>
                <ChevronDown className="w-4 h-4 text-text-dim ml-2" />
              </div>

              {isCalendarOpen && (
                <div className="absolute top-full mt-2 left-0 md:left-auto md:right-0 bg-surface border border-border rounded-xl shadow-xl z-50">
                  <MonthPicker
                    selected={dateRange}
                    onSelect={(range) => {
                      setDateRange(range);
                      setIsCalendarOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1 md:justify-end">
            <div className="h-4 hidden md:block"></div>
            <div className="flex gap-2">
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2.5 bg-surface-light border border-border hover:bg-border rounded-full transition-colors text-text-dim hover:text-white flex items-center justify-center"
                title="Configurações de API"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button 
                onClick={fetchReport}
                disabled={loading}
                className="p-2.5 bg-surface-light border border-border hover:bg-border rounded-full transition-colors disabled:opacity-50 text-text-main flex items-center justify-center"
                title="Gerar Relatório"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'text-accent animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-[#ef444420] border border-[#ef444450] text-[#EF4444] text-sm font-medium rounded-xl">
          {error}
        </div>
      )}

      <div className="flex-1 p-6 flex flex-col gap-6 mx-auto w-full max-w-5xl">
        {report ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Total Card */}
              <div className={`bg-surface border-l-4 ${report.totalPnl + report.totalFees + report.totalFunding >= 0 ? 'border-[#10B981]' : 'border-[#EF4444]'} border-y border-r border-border rounded-xl p-6 relative`}>
                
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <div className="text-[11px] text-text-dim uppercase tracking-wider font-semibold">PNL LÍQUIDO</div>
                      {usdToBrl !== null && (
                        <div className="text-[9px] text-text-dim bg-surface-light px-1.5 py-0.5 rounded font-mono border border-border/30" title="Cotação Oficial">
                          1 USD = {usdToBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      )}
                    </div>
                    <div className={`text-4xl font-bold font-mono tracking-tight ${totalNet >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                      {totalNet > 0 ? '+' : ''}{totalNet.toFixed(2).replace('.', ',')} USDT
                    </div>
                    {usdToBrl !== null && (
                      <div className="text-sm font-mono mt-1 text-text-dim">
                        ~ {(Math.abs(totalNet) * usdToBrl).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex flex-col items-end">
                      <div className="text-[11px] text-text-dim uppercase tracking-wider font-semibold mb-2">Média / Dia</div>
                      <div className={`text-xl font-bold font-mono tracking-tight flex items-center justify-end flex-wrap gap-x-2 ${avgPerDay >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                        <span>{avgPerDay > 0 ? '+' : ''}{avgPerDay.toFixed(2).replace('.', ',')} USDT</span>
                      </div>
                      {usdToBrl !== null && (
                        <div className="text-xs font-mono mt-1 text-text-dim border-b border-border/30 pb-3 mb-3 w-full text-right">
                          ~ {(Math.abs(avgPerDay) * usdToBrl).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      )}
                    </div>
                    
                    <div className={usdToBrl === null ? "mt-4" : ""}>
                      <div className="text-[11px] text-text-dim uppercase tracking-wider font-semibold mb-2">Projeção Mês</div>
                      <div className={`text-xl font-bold font-mono tracking-tight ${projMonth >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                        {projMonth > 0 ? '+' : ''}{projMonth.toFixed(2).replace('.', ',')} USDT
                      </div>
                      {usdToBrl !== null && (
                        <div className="text-xs font-mono mt-1 text-text-dim">
                          ~ {(Math.abs(projMonth) * usdToBrl).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="mt-8 pt-4 border-t border-border flex flex-col gap-3 font-mono text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-text-dim font-sans">Total</span>
                    <span className={report.totalPnl >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}>
                      {report.totalPnl > 0 ? '+' : ''}{(report.totalPnl).toFixed(2).replace('.', ',')} USDT
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-dim font-sans">Taxas de trade</span>
                    <span className={report.totalFees >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}>
                      {report.totalFees > 0 ? '+' : ''}{(report.totalFees).toFixed(2).replace('.', ',')} USDT
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-dim font-sans">Funding</span>
                    <span className={report.totalFunding >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}>
                      {report.totalFunding > 0 ? '+' : ''}{(report.totalFunding).toFixed(2).replace('.', ',')} USDT
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats Card */}
              <div className="bg-surface border border-border rounded-xl p-6 flex flex-col justify-between">
                <div className="flex flex-col md:flex-row gap-6 items-center">
                  <div className="flex flex-col gap-6 flex-1 w-full">
                    <div>
                      <div className="text-[11px] text-text-dim uppercase tracking-wider font-semibold mb-2">Taxa de Acerto</div>
                      <div className="text-3xl font-bold font-mono text-text-main">
                        {report.winRate.toFixed(2).replace('.', ',')}%
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-[11px] text-text-dim uppercase tracking-wider font-semibold mb-2">Fator de Lucro</div>
                      <div className="text-3xl font-bold font-mono text-text-main">
                        {report.profitFactor === 999 ? '∞' : report.profitFactor.toFixed(2).replace('.', ',')}
                      </div>
                    </div>
                  </div>

                  {(report.winningTrades > 0 || report.losingTrades > 0) && (
                    <div className="w-full md:w-1/2 flex flex-col items-center">
                      <div className="text-[11px] text-text-dim uppercase tracking-wider font-semibold mb-2 w-full text-left md:text-center">
                        Total de Trades
                      </div>
                      <div className="h-32 w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Positivos', value: report.winningTrades },
                                { name: 'Negativos', value: report.losingTrades }
                              ]}
                              cx="50%"
                              cy="50%"
                              innerRadius={35}
                              outerRadius={55}
                              paddingAngle={5}
                              dataKey="value"
                              stroke="none"
                            >
                              <Cell key="cell-0" fill="#10B981" />
                              <Cell key="cell-1" fill="#EF4444" />
                            </Pie>
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '0.5rem', fontSize: '10px' }}
                              itemStyle={{ color: '#f3f4f6' }}
                              formatter={(value: number) => [value, 'Trades']}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-sm font-bold text-text-main">{report.winningTrades + report.losingTrades}</span>
                        </div>
                      </div>
                      <div className="flex gap-4 mt-2 text-[10px] font-mono">
                        <div className="flex items-center gap-1 text-[#10B981]">
                          <div className="w-2 h-2 rounded-full bg-[#10B981]"></div>
                          {report.winningTrades}
                        </div>
                        <div className="flex items-center gap-1 text-[#EF4444]">
                          <div className="w-2 h-2 rounded-full bg-[#EF4444]"></div>
                          {report.losingTrades}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Position History */}
            <div>
              <div className="flex items-center justify-between mb-4 mt-2">
                <div className="flex space-x-6 text-sm">
                  <span className="font-medium text-[#FCD535] border-b-2 border-[#FCD535] pb-1">Position History ({report.trades.length})</span>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {report.trades.map((trade, index) => {
                  const netPnl = trade.pnl + trade.fees + trade.funding;
                  return (
                    <div key={index} className="bg-surface rounded-xl shadow border border-border flex flex-col p-4 font-sans">
                      <div className="flex justify-between items-center pb-3 border-b border-border/50">
                        <div className="flex flex-row items-center gap-2">
                          <span className="font-bold text-white text-base">{trade.symbol}</span>
                          <span className="text-[10px] bg-[#2B3139] text-[#EAECEF] px-1.5 py-0.5 rounded font-medium">Perp</span>
                          <span className="text-[10px] text-[#EAECEF] font-medium px-1.5 py-0.5 rounded bg-surface-light border border-border">Closed</span>
                          {trade.leverage ? <span className="text-[10px] text-[#3B82F6] font-medium px-1.5 py-0.5 rounded bg-[#3B82F6]/10 border border-[#3B82F6]/30">{trade.leverage}x</span> : null}
                        </div>
                        <div className="text-xs text-text-dim flex gap-2">
                           <span>{formatDate(trade.openTime)} Opened</span>
                           <span className="text-border">|</span>
                           <span>{formatDate(trade.closeTime)} Closed</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-6 gap-6 pt-4 text-sm font-mono">
                        <div>
                           <div className="text-text-dim text-xs mb-1 font-sans">Realized PNL (USDT)</div>
                           <div className={trade.pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}>
                             {trade.pnl > 0 ? "+" : ""}{trade.pnl.toFixed(4)}
                           </div>
                        </div>
                        <div>
                           <div className="text-text-dim text-xs mb-1 font-sans">Fees (USDT)</div>
                           <div className="text-[#F6465D]">
                             {trade.fees < 0 ? trade.fees.toFixed(4) : trade.fees.toFixed(4)}
                           </div>
                        </div>
                        <div>
                           <div className="text-text-dim text-xs mb-1 font-sans">Funding (USDT)</div>
                           <div className={trade.funding >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}>
                             {trade.funding > 0 ? "+" : ""}{trade.funding.toFixed(4)}
                           </div>
                        </div>
                        <div>
                           <div className="text-text-dim text-xs mb-1 font-sans">Net PNL (USDT)</div>
                           <div className={netPnl >= 0 ? "text-[#0ECB81] font-bold" : "text-[#F6465D] font-bold"}>
                             {netPnl > 0 ? "+" : ""}{netPnl.toFixed(4)}
                           </div>
                        </div>
                        <div>
                           <div className="text-text-dim text-xs mb-1 font-sans">Duration</div>
                           <div className="text-[#EAECEF]">
                             {formatDuration(trade.openTime, trade.closeTime)}
                           </div>
                        </div>
                        <div>
                           <div className="text-text-dim text-xs mb-1 font-sans">Trades</div>
                           <div className="text-text-dim">
                             {trade.tradeCount} <span className="text-[10px] uppercase font-sans">orders</span>
                           </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {report.trades.length === 0 && (
                  <div className="bg-surface rounded-xl border border-border p-12 text-center text-text-dim font-sans">
                    Nenhum histórico de posição encontrado neste período.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center border-2 border-dashed border-border rounded-xl opacity-50 p-12">
            <div className="text-center font-medium text-text-dim">
              Clique em "Gerar relatório" para visualizar seus dados de PNL.
              <br /><br className="hidden md:block"/>
              <span className="text-xs opacity-75">Configuração exigida: BINANCE_API_KEY e BINANCE_API_SECRET</span>
            </div>
          </div>
        )}
      </div>

      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-border/50 flex justify-between items-center bg-surface-light/50">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-accent" />
                Configurar API Binance
              </h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="text-text-dim hover:text-white p-1 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4 text-sm">
              <p className="text-text-dim text-xs mb-2">
                Suas chaves serão armazenadas localmente no seu navegador. Isso permite consultar a Binance diretamente, sem as chaves do servidor.
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-text-dim tracking-wider font-semibold">API Key</label>
                <input 
                  type="text" 
                  value={customApiKey}
                  onChange={e => setCustomApiKey(e.target.value)}
                  placeholder="Insira sua API Key"
                  className="bg-[#1e2329] border border-border px-3 py-2 rounded focus:outline-none focus:border-accent text-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-text-dim tracking-wider font-semibold">API Secret</label>
                <input 
                  type="password" 
                  value={customApiSecret}
                  onChange={e => setCustomApiSecret(e.target.value)}
                  placeholder="Insira sua API Secret"
                  className="bg-[#1e2329] border border-border px-3 py-2 rounded focus:outline-none focus:border-accent text-white"
                />
              </div>
            </div>
            <div className="p-4 border-t border-border/50 flex justify-end gap-3 bg-surface-light/30">
              <button 
                onClick={() => {
                  setCustomApiKey('');
                  setCustomApiSecret('');
                  localStorage.removeItem('BINANCE_API_KEY');
                  localStorage.removeItem('BINANCE_API_SECRET');
                }}
                className="px-4 py-2 text-text-dim hover:text-white transition-colors"
              >
                Limpar
              </button>
              <button 
                onClick={() => {
                  localStorage.setItem('BINANCE_API_KEY', customApiKey);
                  localStorage.setItem('BINANCE_API_SECRET', customApiSecret);
                  setIsSettingsOpen(false);
                }}
                className="px-6 py-2 bg-accent hover:bg-accent/80 text-white font-medium rounded transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
