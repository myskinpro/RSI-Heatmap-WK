import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Trash2 } from 'lucide-react';
import axios from 'axios';

interface EvolutionRecord {
  id: string;
  month: string; // YYYY-MM
  amount: number;
}

const Evolution: React.FC = () => {
  const [records, setRecords] = useState<EvolutionRecord[]>([]);
  const [month, setMonth] = useState('');
  const [amount, setAmount] = useState('');
  const [usdToBrl, setUsdToBrl] = useState<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('evolutionRecords');
    if (saved) {
      try {
        setRecords(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }

    // Fetch USD to BRL exchange rate
    axios.get('https://economia.awesomeapi.com.br/last/USD-BRL')
      .then(response => {
        if (response.data?.USDBRL?.ask) {
          setUsdToBrl(parseFloat(response.data.USDBRL.ask));
        }
      })
      .catch(err => {
        console.warn("Failed to fetch USD to BRL rate", err);
      });
  }, []);

  const saveRecords = (newRecords: EvolutionRecord[]) => {
    setRecords(newRecords);
    localStorage.setItem('evolutionRecords', JSON.stringify(newRecords));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!month || !amount) return;

    const newRecord: EvolutionRecord = {
      id: Date.now().toString(),
      month,
      amount: parseFloat(amount)
    };

    const newRecords = [...records, newRecord].sort((a, b) => a.month.localeCompare(b.month));
    saveRecords(newRecords);
    setMonth('');
    setAmount('');
  };

  const handleDelete = (id: string) => {
    const newRecords = records.filter(r => r.id !== id);
    saveRecords(newRecords);
  };

  // Prepare chart data (Cumulative)
  let cumulative = 0;
  const chartData = records.map(r => {
    cumulative += r.amount;
    
    // Format month for display
    const [year, m] = r.month.split('-');
    const date = new Date(parseInt(year), parseInt(m) - 1);
    const monthName = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

    return {
      name: monthName,
      month: r.month,
      amount: r.amount,
      cumulative: cumulative
    };
  });

  return (
    <div className="p-6 max-w-6xl mx-auto w-full flex flex-col gap-6 font-sans">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white tracking-tight">Evolução do Capital</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Form & List */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-surface border border-border p-5 rounded-xl shadow">
            <h3 className="text-text-main font-semibold mb-4">Adicionar Registro</h3>
            <form onSubmit={handleAdd} className="flex flex-col gap-4">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">Mês</label>
                <input 
                  type="month" 
                  value={month}
                  onChange={e => setMonth(e.target.value)}
                  className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">Resultado (USDT)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Ex: 150.50 ou -50.00"
                  className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent"
                  required
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-accent hover:bg-accent/90 text-white font-medium py-2 rounded-lg transition-colors"
              >
                Adicionar
              </button>
            </form>
          </div>

          <div className="bg-surface border border-border p-5 rounded-xl shadow flex-1">
            <h3 className="text-text-main font-semibold mb-4">Histórico</h3>
            <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
              {records.length === 0 ? (
                <div className="text-sm text-text-dim text-center py-4">Nenhum registro adicionado.</div>
              ) : (
                records.map(record => {
                  const [year, m] = record.month.split('-');
                  const date = new Date(parseInt(year), parseInt(m) - 1);
                  const monthName = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                  
                  return (
                    <div key={record.id} className="flex justify-between items-center p-3 bg-surface-light border border-border/50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium text-white capitalize">{monthName}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-sm font-mono font-bold ${record.amount >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                          {record.amount >= 0 ? '+' : ''}{record.amount.toFixed(2)}
                        </span>
                        <button onClick={() => handleDelete(record.id)} className="text-text-dim hover:text-[#EF4444] transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-2 bg-surface border border-border p-5 rounded-xl shadow flex flex-col min-h-[400px]">
          <h3 className="text-text-main font-semibold mb-6">Crescimento Acumulado</h3>
          {chartData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-text-dim">
              Adicione registros para visualizar o gráfico.
            </div>
          ) : (
            <div className="flex-1 w-full min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#848E9C" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#848E9C" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '0.5rem', color: '#fff' }}
                    itemStyle={{ color: '#3B82F6', fontWeight: 'bold' }}
                    formatter={(value: number) => [`${value.toFixed(2)} USDT`, 'Acumulado']}
                    labelStyle={{ color: '#9CA3AF', marginBottom: '4px' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="cumulative" 
                    stroke="#3B82F6" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorCumulative)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          
          {chartData.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-6">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-1">Total Acumulado</div>
                <div className={`text-2xl font-mono font-bold ${cumulative >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                  {cumulative >= 0 ? '+' : ''}{cumulative.toFixed(2)} USDT
                </div>
                {usdToBrl !== null && (
                  <div className="text-sm font-mono mt-1 text-text-dim">
                    ~ {(Math.abs(cumulative) * usdToBrl).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-1">Média Mensal</div>
                <div className={`text-xl font-mono font-bold ${cumulative >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                  {(cumulative / chartData.length).toFixed(2)} USDT
                </div>
                {usdToBrl !== null && (
                  <div className="text-xs font-mono mt-1 text-text-dim">
                    ~ {(Math.abs(cumulative / chartData.length) * usdToBrl).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Evolution;
