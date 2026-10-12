import React, { useState, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface TradeRecord {
  id: string;
  date: string;
  pair: string;
  direction: 'Long' | 'Short';
  strategy: string;
  timeframe: string;
  riskReward: string;
  result: 'Win' | 'Loss' | 'Breakeven';
  pnl: number;
  notes: string;
}

const TradeJournal: React.FC = () => {
  const [records, setRecords] = useState<TradeRecord[]>([]);
  
  const [date, setDate] = useState('');
  const [pair, setPair] = useState('');
  const [direction, setDirection] = useState<'Long' | 'Short'>('Long');
  const [strategy, setStrategy] = useState('Ret. Fibo 0.786');
  const [timeframe, setTimeframe] = useState('M15');
  const [riskReward, setRiskReward] = useState('2x1');
  const [result, setResult] = useState<'Win' | 'Loss' | 'Breakeven'>('Win');
  const [pnl, setPnl] = useState('');
  const [notes, setNotes] = useState('');

  const [filterCrypto, setFilterCrypto] = useState('All');

  useEffect(() => {
    const saved = localStorage.getItem('tradeJournalRecords');
    if (saved) {
      try {
        setRecords(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const saveRecords = (newRecords: TradeRecord[]) => {
    setRecords(newRecords);
    localStorage.setItem('tradeJournalRecords', JSON.stringify(newRecords));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !pair || !strategy || !timeframe || !riskReward) return;

    const newRecord: TradeRecord = {
      id: Date.now().toString(),
      date,
      pair: pair.toUpperCase(),
      direction,
      strategy,
      timeframe,
      riskReward,
      result,
      pnl: pnl ? parseFloat(pnl) : 0,
      notes
    };

    const newRecords = [newRecord, ...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveRecords(newRecords);
    
    // Reset partial form
    setPair('');
    setPnl('');
    setNotes('');
  };

  const handleDelete = (id: string) => {
    const newRecords = records.filter(r => r.id !== id);
    saveRecords(newRecords);
  };

  const wins = records.filter(r => r.result === 'Win').length;
  const losses = records.filter(r => r.result === 'Loss').length;
  const winRate = records.length > 0 ? (wins / (wins + losses || 1)) * 100 : 0;
  const totalPnl = records.reduce((acc, r) => acc + r.pnl, 0);

  const totalProfit = records.filter(r => r.pnl > 0).reduce((acc, r) => acc + r.pnl, 0);
  const totalLoss = Math.abs(records.filter(r => r.pnl < 0).reduce((acc, r) => acc + r.pnl, 0));
  const averageWin = wins > 0 ? totalProfit / wins : 0;
  const averageLoss = losses > 0 ? totalLoss / losses : 0;
  const riskRewardFactor = averageLoss > 0 ? (averageWin / averageLoss) : (averageWin > 0 ? Infinity : 0);

  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const monthlyData = months.map((month, index) => {
    const monthRecords = records.filter(r => new Date(r.date).getMonth() === index);
    const pnl = monthRecords.reduce((acc, r) => acc + r.pnl, 0);
    return { name: month, pnl };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const pnl = payload[0].value;
      return (
        <div className="bg-surface border border-border p-3 rounded-lg shadow-lg">
          <p className="text-text-main font-semibold mb-1">{label}</p>
          <p className={`font-mono font-bold ${pnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
            PNL: {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} USDT
          </p>
        </div>
      );
    }
    return null;
  };

  const cryptoPairs = Array.from(new Set(records.map(r => r.pair)));
  const cryptoData = cryptoPairs.map(pair => {
    const pairRecords = records.filter(r => r.pair === pair);
    const pnl = pairRecords.reduce((acc, r) => acc + r.pnl, 0);
    const trades = pairRecords.length;
    const wins = pairRecords.filter(r => r.result === 'Win').length;
    const losses = pairRecords.filter(r => r.result === 'Loss').length;
    const winRate = trades > 0 ? (wins / (wins + losses || 1)) * 100 : 0;
    
    const pairTotalProfit = pairRecords.filter(r => r.pnl > 0).reduce((acc, r) => acc + r.pnl, 0);
    const pairTotalLoss = Math.abs(pairRecords.filter(r => r.pnl < 0).reduce((acc, r) => acc + r.pnl, 0));
    const pairAverageWin = wins > 0 ? pairTotalProfit / wins : 0;
    const pairAverageLoss = losses > 0 ? pairTotalLoss / losses : 0;
    const riskReward = pairAverageLoss > 0 ? (pairAverageWin / pairAverageLoss) : (pairAverageWin > 0 ? Infinity : 0);

    return { 
      name: pair, 
      pnl, 
      trades, 
      wins, 
      losses, 
      winRate, 
      riskReward 
    };
  }).sort((a, b) => b.pnl - a.pnl);

  const CryptoTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-surface border border-border p-3 rounded-lg shadow-lg flex flex-col gap-1 min-w-[200px] z-50 relative">
          <p className="text-text-main font-bold mb-2 border-b border-border/50 pb-1">{label}</p>
          <div className="flex justify-between text-sm">
            <span className="text-text-dim">PNL Total:</span>
            <span className={`font-mono font-bold ${data.pnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
              {data.pnl >= 0 ? '+' : ''}{data.pnl.toFixed(2)} USDT
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-dim">Total Trades:</span>
            <span className="font-medium text-white">{data.trades}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-dim">Win Rate:</span>
            <span className="font-medium text-[#10B981]">{data.winRate.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-dim">Vitórias/Derrotas:</span>
            <span className="font-medium text-white">
              <span className="text-[#10B981]">{data.wins}</span> / <span className="text-[#EF4444]">{data.losses}</span>
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-dim">Risco/Retorno:</span>
            <span className={`font-medium ${data.riskReward >= 1 ? 'text-[#10B981]' : (data.riskReward > 0 ? 'text-[#EAB308]' : 'text-text-dim')}`}>
              {data.riskReward === Infinity ? '∞' : data.riskReward.toFixed(2)}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto w-full flex flex-col gap-6 font-sans">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white tracking-tight">Diário de Trade</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico Mensal */}
        <div className="bg-surface border border-border p-5 rounded-xl shadow w-full">
          <h3 className="text-text-main font-semibold mb-4 text-sm uppercase tracking-wider">Desempenho Mensal (PNL)</h3>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#8892B0', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8892B0', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#233554', opacity: 0.4 }} />
                <Bar dataKey="pnl" radius={[4, 4, 4, 4]}>
                  {monthlyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10B981' : '#EF4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Gráfico por Cripto */}
        <div className="bg-surface border border-border p-5 rounded-xl shadow w-full">
          <h3 className="text-text-main font-semibold mb-4 text-sm uppercase tracking-wider">Desempenho por Cripto (PNL)</h3>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cryptoData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#8892B0', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8892B0', fontSize: 12 }} />
                <Tooltip content={<CryptoTooltip />} cursor={{ fill: '#233554', opacity: 0.4 }} />
                <Bar dataKey="pnl" radius={[4, 4, 4, 4]}>
                  {cryptoData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10B981' : '#EF4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-surface border border-border p-4 rounded-xl shadow">
          <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-1">Total de Trades</div>
          <div className="text-2xl font-mono font-bold text-white">{records.length}</div>
        </div>
        <div className="bg-surface border border-border p-4 rounded-xl shadow">
          <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-1">Win Rate</div>
          <div className="text-2xl font-mono font-bold text-[#10B981]">{winRate.toFixed(1)}%</div>
        </div>
        <div className="bg-surface border border-border p-4 rounded-xl shadow">
          <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-1">Vitórias / Derrotas</div>
          <div className="text-2xl font-mono font-bold text-white"><span className="text-[#10B981]">{wins}</span> / <span className="text-[#EF4444]">{losses}</span></div>
        </div>
        <div className="bg-surface border border-border p-4 rounded-xl shadow">
          <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-1">PNL Total</div>
          <div className={`text-2xl font-mono font-bold ${totalPnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} USDT
          </div>
        </div>
        <div className="bg-surface border border-border p-4 rounded-xl shadow">
          <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-1">Fator Risco/Retorno</div>
          <div className={`text-2xl font-mono font-bold ${riskRewardFactor >= 1 ? 'text-[#10B981]' : (riskRewardFactor > 0 ? 'text-[#EAB308]' : 'text-text-dim')}`}>
            {riskRewardFactor === Infinity ? '∞' : riskRewardFactor.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-surface border border-border p-5 rounded-xl shadow">
            <h3 className="text-text-main font-semibold mb-4">Novo Trade</h3>
            <form onSubmit={handleAdd} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">Data e Hora</label>
                  <input 
                    type="datetime-local" 
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">Risco / Retorno</label>
                  <select
                    value={riskReward}
                    onChange={e => setRiskReward(e.target.value)}
                    className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent"
                    required
                  >
                    <option value="2x1">2x1</option>
                    <option value="3x1">3x1</option>
                    <option value="4x1">4x1</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">Par</label>
                  <input 
                    type="text" 
                    value={pair}
                    onChange={e => setPair(e.target.value)}
                    placeholder="BTCUSDT"
                    className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">Direção</label>
                  <select
                    value={direction}
                    onChange={e => setDirection(e.target.value as any)}
                    className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent"
                  >
                    <option value="Long">Long</option>
                    <option value="Short">Short</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">Estratégia</label>
                  <select
                    value={strategy}
                    onChange={e => setStrategy(e.target.value)}
                    className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent"
                    required
                  >
                    <option value="Ret. Fibo 0.786">Ret. Fibo 0.786</option>
                    <option value="Cruzamento Médias 9x18">Cruzamento Médias 9x18</option>
                    <option value="Fimathe">Fimathe</option>
                    <option value="Traders Club">Traders Club</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">Timeframe</label>
                  <select
                    value={timeframe}
                    onChange={e => setTimeframe(e.target.value)}
                    className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent"
                    required
                  >
                    <option value="M1">M1</option>
                    <option value="M5">M5</option>
                    <option value="M15">M15</option>
                    <option value="M30">M30</option>
                    <option value="1H">1H</option>
                    <option value="4H">4H</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">Resultado</label>
                  <select
                    value={result}
                    onChange={e => setResult(e.target.value as any)}
                    className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent"
                  >
                    <option value="Win">Win</option>
                    <option value="Loss">Loss</option>
                    <option value="Breakeven">0x0</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">PNL (USDT)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={pnl}
                    onChange={e => setPnl(e.target.value)}
                    placeholder="Ex: 5.50 ou -2.00"
                    className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">Observações / Lições</label>
                <textarea 
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="O que deu certo? O que deu errado?"
                  className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent min-h-[80px]"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-accent hover:bg-accent/90 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={18} /> Salvar Trade
              </button>
            </form>
          </div>
        </div>

        {/* Histórico */}
        <div className="lg:col-span-2 bg-surface border border-border p-5 rounded-xl shadow flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-text-main font-semibold">Histórico de Operações</h3>
            <select
              value={filterCrypto}
              onChange={e => setFilterCrypto(e.target.value)}
              className="bg-surface-light border border-border rounded-lg px-3 py-1.5 text-sm text-text-main focus:outline-none focus:border-accent"
            >
              <option value="All">Todos os Pares</option>
              {cryptoPairs.map(pair => (
                <option key={pair} value={pair}>{pair}</option>
              ))}
            </select>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-1">
            {records.length === 0 ? (
              <div className="text-sm text-text-dim text-center py-10">Nenhum trade registrado ainda.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {records.filter(r => filterCrypto === 'All' || r.pair === filterCrypto).length === 0 ? (
                  <div className="text-sm text-text-dim text-center py-10">Nenhum trade encontrado para {filterCrypto}.</div>
                ) : (
                  records
                    .filter(r => filterCrypto === 'All' || r.pair === filterCrypto)
                    .map(record => {
                      const dateObj = new Date(record.date);
                      const formattedDate = dateObj.toLocaleDateString('pt-BR') + ' ' + dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                      
                      return (
                        <div key={record.id} className="flex flex-col p-4 bg-surface-light border border-border/50 rounded-lg group">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold px-2 py-1 rounded ${record.direction === 'Long' ? 'bg-[#10B981]/20 text-[#10B981]' : 'bg-[#EF4444]/20 text-[#EF4444]'}`}>
                            {record.direction}
                          </span>
                          <span className="font-bold text-white">{record.pair}</span>
                          <span className="text-xs text-text-dim">{formattedDate}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`font-mono font-bold ${record.pnl > 0 ? 'text-[#10B981]' : record.pnl < 0 ? 'text-[#EF4444]' : 'text-text-dim'}`}>
                            {record.pnl > 0 ? '+' : ''}{record.pnl.toFixed(2)} USDT
                          </span>
                          <button onClick={() => handleDelete(record.id)} className="text-text-dim hover:text-[#EF4444] transition-colors opacity-0 group-hover:opacity-100">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 items-center mb-2">
                        <span className="text-xs bg-surface border border-border px-2 py-1 rounded text-text-dim">
                          TF: <span className="text-white">{record.timeframe || '-'}</span>
                        </span>
                        <span className="text-xs bg-surface border border-border px-2 py-1 rounded text-text-dim">
                          R/R: <span className="text-white">{record.riskReward || '-'}</span>
                        </span>
                        <span className="text-xs bg-surface border border-border px-2 py-1 rounded text-text-dim">
                          Estratégia: <span className="text-white">{record.strategy}</span>
                        </span>
                        <span className={`text-xs font-medium px-2 py-1 rounded ${record.result === 'Win' ? 'text-[#10B981]' : record.result === 'Loss' ? 'text-[#EF4444]' : 'text-gray-400'}`}>
                          {record.result}
                        </span>
                      </div>
                      
                      {record.notes && (
                        <div className="text-sm text-text-dim bg-surface p-2 rounded border border-border mt-1">
                          {record.notes}
                        </div>
                      )}
                    </div>
                  );
                })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeJournal;
