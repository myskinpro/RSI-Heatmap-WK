import React, { useState, useMemo } from 'react';
import { Calculator, ArrowRight, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

export default function Strategy() {
  const [positionType, setPositionType] = useState<'Long' | 'Short'>('Long');
  const [initialCapital, setInitialCapital] = useState<number | ''>('');
  const [leverage, setLeverage] = useState<number | ''>('');
  const [initialPrice, setInitialPrice] = useState<number | ''>('');
  const [sellDropPercent, setSellDropPercent] = useState<number | ''>('');
  const [sellPositionPercent, setSellPositionPercent] = useState<number | ''>('');
  const [rebuyDropPercent, setRebuyDropPercent] = useState<number | ''>('');
  const [rebuyAddUsdt, setRebuyAddUsdt] = useState<number | ''>('');
  const [cycles, setCycles] = useState<number | ''>('');

  // Função para formatar os valores
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const simulationData = useMemo(() => {
    if (initialCapital === '' || initialPrice === '' || initialPrice === 0) {
      return [];
    }

    const isLong = positionType === 'Long';
    const dir = isLong ? -1 : 1;
    
    const safeCycles = cycles === '' ? 0 : cycles;
    const safeSellDropPercent = sellDropPercent === '' ? 0 : sellDropPercent;
    const safeSellPositionPercent = sellPositionPercent === '' ? 0 : sellPositionPercent;
    const safeRebuyDropPercent = rebuyDropPercent === '' ? 0 : rebuyDropPercent;
    const safeRebuyAddUsdt = rebuyAddUsdt === '' ? 0 : rebuyAddUsdt;
    const safeLeverage = leverage === '' ? 1 : leverage;

    const data = [];
    let currentPrice = initialPrice as number;
    const effectiveInitialCapital = (initialCapital as number) * safeLeverage;
    let coins = effectiveInitialCapital / currentPrice;
    let totalInvested = initialCapital as number;
    let avgPrice = currentPrice;
    let totalRealizedLoss = 0;
    
    data.push({
      step: 0,
      action: 'Entrada Inicial',
      price: currentPrice,
      coins: coins,
      avgPrice: avgPrice,
      totalInvested: totalInvested,
      breakEvenPrice: isLong ? avgPrice - (totalRealizedLoss / coins) : avgPrice + (totalRealizedLoss / coins),
      positionValue: coins * currentPrice,
      pnl: 0,
      pnlPercent: 0,
      realizedLoss: 0,
      note: '-'
    });

    for (let i = 1; i <= safeCycles; i++) {
      // Stop Parcial
      const actionPrice = currentPrice * (1 + dir * (safeSellDropPercent / 100));
      const coinsToReduce = coins * (safeSellPositionPercent / 100);
      const usdtValue = coinsToReduce * actionPrice;
      
      const stepRealizedLoss = isLong 
        ? usdtValue - (coinsToReduce * avgPrice)
        : (avgPrice - actionPrice) * coinsToReduce;
        
      totalRealizedLoss += stepRealizedLoss;
      
      coins -= coinsToReduce;
      const positionValueAfterStop = coins * actionPrice;
      const pnlAfterStop = isLong 
        ? positionValueAfterStop - (coins * avgPrice)
        : (coins * avgPrice) - positionValueAfterStop;

      data.push({
        step: i,
        action: `Stop Parcial (Ciclo ${i})`,
        price: actionPrice,
        coins: coins,
        avgPrice: avgPrice,
        totalInvested: totalInvested,
        breakEvenPrice: isLong ? avgPrice - (totalRealizedLoss / coins) : avgPrice + (totalRealizedLoss / coins),
        positionValue: positionValueAfterStop,
        pnl: pnlAfterStop,
        pnlPercent: (pnlAfterStop / (coins * avgPrice)) * 100 || 0,
        realizedLoss: totalRealizedLoss,
        note: `Reduziu ${coinsToReduce.toFixed(6)} moedas a $${formatCurrency(actionPrice)}`
      });

      // Reentrada
      const reentryPrice = actionPrice * (1 + dir * (safeRebuyDropPercent / 100));
      const effectiveRebuyUsdt = safeRebuyAddUsdt * safeLeverage;
      const usdtToReentry = usdtValue + effectiveRebuyUsdt;
      const coinsAdded = usdtToReentry / reentryPrice;
      
      const previousTotalCost = coins * avgPrice;
      coins += coinsAdded;
      avgPrice = (previousTotalCost + usdtToReentry) / coins;
      totalInvested += safeRebuyAddUsdt;
      currentPrice = reentryPrice;

      const positionValueAfterReentry = coins * reentryPrice;
      const pnlAfterReentry = isLong 
        ? positionValueAfterReentry - (coins * avgPrice)
        : (coins * avgPrice) - positionValueAfterReentry;

      data.push({
        step: i,
        action: `Reentrada (Ciclo ${i})`,
        price: reentryPrice,
        coins: coins,
        avgPrice: avgPrice,
        totalInvested: totalInvested,
        breakEvenPrice: isLong ? avgPrice - (totalRealizedLoss / coins) : avgPrice + (totalRealizedLoss / coins),
        positionValue: positionValueAfterReentry,
        pnl: pnlAfterReentry,
        pnlPercent: (pnlAfterReentry / (coins * avgPrice)) * 100 || 0,
        realizedLoss: totalRealizedLoss,
        note: `Adicionou ${coinsAdded.toFixed(6)} moedas a $${formatCurrency(reentryPrice)}`
      });
    }

    return data;
  }, [positionType, initialCapital, leverage, initialPrice, sellDropPercent, sellPositionPercent, rebuyDropPercent, rebuyAddUsdt, cycles]);

  const lastStep = simulationData.length > 0 ? simulationData[simulationData.length - 1] : null;
  const finalTotalInvested = lastStep ? lastStep.totalInvested : 0;
  const finalAvgPrice = lastStep ? lastStep.avgPrice : 0;
  const finalBreakEven = lastStep ? lastStep.breakEvenPrice : 0;
  const finalRealizedLoss = lastStep ? lastStep.realizedLoss : 0;
  
  const varPercent = lastStep && typeof initialPrice === 'number' && initialPrice > 0 
    ? ((lastStep.price - initialPrice) / initialPrice) * 100 
    : 0;
  
  const isVarNegative = varPercent * (positionType === 'Long' ? -1 : 1) > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto w-full flex flex-col gap-6 font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Calculator className="w-8 h-8 text-accent" />
            Simulador de Estratégia de Reentrada (Martingale Adaptado)
          </h1>
          <p className="text-text-dim mt-1 text-sm">
            Simule o comportamento de vender parcialmente com prejuízo e recomprar com um aporte maior.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="bg-surface border border-border p-5 rounded-xl shadow flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-text-main font-semibold">Parâmetros Iniciais</h3>
              <div className="flex items-center bg-surface-light rounded p-1 text-[10px] font-semibold">
                <button 
                  onClick={() => setPositionType('Long')}
                  className={`px-2 py-1 rounded transition-colors ${positionType === 'Long' ? 'bg-[#10B981] text-white' : 'text-text-dim hover:text-white'}`}
                >
                  LONG
                </button>
                <button 
                  onClick={() => setPositionType('Short')}
                  className={`px-2 py-1 rounded transition-colors ${positionType === 'Short' ? 'bg-[#EF4444] text-white' : 'text-text-dim hover:text-white'}`}
                >
                  SHORT
                </button>
              </div>
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-dim">Capital Inicial (USDT)</label>
              <input 
                type="number" 
                value={initialCapital} 
                onChange={e => setInitialCapital(e.target.value === '' ? '' : Number(e.target.value))}
                className="bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:border-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-dim">Alavancagem (x)</label>
              <input 
                type="number" 
                value={leverage} 
                onChange={e => setLeverage(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex: 10"
                className="bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:border-accent"
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-dim">Preço do Ativo (Entrada)</label>
              <input 
                type="number" 
                value={initialPrice} 
                onChange={e => setInitialPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className="bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:border-accent"
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-dim">Quantidade de Ciclos a Simular</label>
              <input 
                type="number" 
                value={cycles} 
                onChange={e => setCycles(e.target.value === '' ? '' : Number(e.target.value))}
                className="bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="bg-surface border border-border p-5 rounded-xl shadow flex flex-col gap-4">
            <h3 className="text-text-main font-semibold border-b border-border pb-2 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-[#EF4444]" />
              Regra de Redução (Stop Parcial)
            </h3>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-dim">Movimento Contra (%)</label>
              <input 
                type="number" 
                value={sellDropPercent} 
                onChange={e => setSellDropPercent(e.target.value === '' ? '' : Number(e.target.value))}
                className="bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:border-accent"
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-dim">Reduzir X% da Posição</label>
              <input 
                type="number" 
                value={sellPositionPercent} 
                onChange={e => setSellPositionPercent(e.target.value === '' ? '' : Number(e.target.value))}
                className="bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="bg-surface border border-border p-5 rounded-xl shadow flex flex-col gap-4">
            <h3 className="text-text-main font-semibold border-b border-border pb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#10B981]" />
              Regra de Reentrada
            </h3>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-dim">Movimento Adicional antes da Reentrada (%)</label>
              <input 
                type="number" 
                value={rebuyDropPercent} 
                onChange={e => setRebuyDropPercent(e.target.value === '' ? '' : Number(e.target.value))}
                className="bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:border-accent"
              />
              <span className="text-[10px] text-text-dim">Deixe 0 para reentrar no mesmo preço.</span>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-dim">Aporte Adicional (USDT)</label>
              <input 
                type="number" 
                value={rebuyAddUsdt} 
                onChange={e => setRebuyAddUsdt(e.target.value === '' ? '' : Number(e.target.value))}
                className="bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:border-accent"
              />
              <span className="text-[10px] text-text-dim">Adicionado ao valor obtido na redução parcial.</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <div className="bg-surface border border-border p-4 rounded-xl shadow flex items-center gap-4">
              <div className="p-3 bg-surface-light rounded-lg">
                <Wallet className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-sm text-text-dim">Total Investido (Final)</p>
                <p className="text-xl font-bold text-white">
                  {formatCurrency(finalTotalInvested)}
                </p>
              </div>
            </div>
            
            <div className="bg-surface border border-border p-4 rounded-xl shadow flex items-center gap-4">
              <div className="p-3 bg-surface-light rounded-lg">
                <ArrowRight className="w-6 h-6 text-[#10B981]" />
              </div>
              <div>
                <p className="text-sm text-text-dim">Preço Médio Final</p>
                <p className="text-xl font-bold text-white">
                  {formatCurrency(finalAvgPrice)}
                </p>
              </div>
            </div>

            <div className="bg-surface border border-border p-4 rounded-xl shadow flex items-center gap-4">
              <div className="p-3 bg-surface-light rounded-lg">
                <ArrowRight className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-sm text-text-dim">Preço de Empate Global</p>
                <p className="text-xl font-bold text-white">
                  {formatCurrency(finalBreakEven)}
                </p>
              </div>
            </div>

            <div className="bg-surface border border-border p-4 rounded-xl shadow flex items-center gap-4">
              <div className="p-3 bg-surface-light rounded-lg">
                <TrendingDown className="w-6 h-6 text-[#EF4444]" />
              </div>
              <div>
                <p className="text-sm text-text-dim">Variação do Ativo (Total)</p>
                <p className={`text-xl font-bold ${
                  isVarNegative ? 'text-[#EF4444]' : 'text-[#10B981]'
                }`}>
                  {varPercent.toFixed(2)}%
                </p>
              </div>
            </div>

            <div className="bg-surface border border-border p-4 rounded-xl shadow flex items-center gap-4">
              <div className="p-3 bg-surface-light rounded-lg">
                <TrendingDown className="w-6 h-6 text-[#EF4444]" />
              </div>
              <div>
                <p className="text-sm text-text-dim">Prejuízo Stop Parcial</p>
                <p className="text-xl font-bold text-[#EF4444]">
                  {formatCurrency(finalRealizedLoss)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl shadow overflow-hidden flex-1">
            <div className="overflow-x-auto h-full max-h-[600px]">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="bg-surface-light sticky top-0 z-10">
                  <tr>
                    <th className="p-4 text-xs font-semibold text-text-dim border-b border-border">Ação</th>
                    <th className="p-4 text-xs font-semibold text-text-dim border-b border-border">Preço</th>
                    <th className="p-4 text-xs font-semibold text-text-dim border-b border-border">Preço Médio</th>
                    <th className="p-4 text-xs font-semibold text-text-dim border-b border-border">Preço Empate</th>
                    <th className="p-4 text-xs font-semibold text-text-dim border-b border-border">Total Investido</th>
                    <th className="p-4 text-xs font-semibold text-text-dim border-b border-border">Qtd Moedas</th>
                    <th className="p-4 text-xs font-semibold text-text-dim border-b border-border">Valor da Posição</th>
                    <th className="p-4 text-xs font-semibold text-text-dim border-b border-border">PNL Atual</th>
                    <th className="p-4 text-xs font-semibold text-text-dim border-b border-border">Info</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {simulationData.map((row, i) => (
                    <tr key={i} className="hover:bg-surface-light/50 transition-colors">
                      <td className="p-4">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${
                          row.action.includes('Entrada Inicial') ? 'bg-accent/20 text-accent' : 
                          row.action.includes('Stop') ? 'bg-[#EF4444]/20 text-[#EF4444]' : 
                          'bg-[#10B981]/20 text-[#10B981]'
                        }`}>
                          {row.action}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-white font-mono">{formatCurrency(row.price)}</td>
                      <td className="p-4 text-sm text-white font-mono">{formatCurrency(row.avgPrice)}</td>
                      <td className="p-4 text-sm text-accent font-bold font-mono">{formatCurrency(row.breakEvenPrice)}</td>
                      <td className="p-4 text-sm text-white font-mono">{formatCurrency(row.totalInvested)}</td>
                      <td className="p-4 text-sm text-white font-mono">{row.coins.toFixed(6)}</td>
                      <td className="p-4 text-sm text-white font-mono">{formatCurrency(row.positionValue)}</td>
                      <td className="p-4 text-sm font-mono">
                        <span className={row.pnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}>
                          {row.pnl >= 0 ? '+' : ''}{formatCurrency(row.pnl)} ({row.pnlPercent.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="p-4 text-xs text-text-dim">{row.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
