import React, { useState } from 'react';

const RiskCalculator: React.FC = () => {
  const [stopPercentage, setStopPercentage] = useState<string>('');
  const [stopValue, setStopValue] = useState<string>('');
  const [riskReward, setRiskReward] = useState<number>(2);

  const calculate = () => {
    const stopPct = parseFloat(stopPercentage);
    const stopVal = parseFloat(stopValue);

    if (isNaN(stopPct) || isNaN(stopVal) || stopPct <= 0 || stopVal <= 0) {
      return null;
    }

    const positionSize = stopVal / (stopPct / 100);
    const targetProfit = stopVal * riskReward;
    const targetPercentage = stopPct * riskReward;

    const margin10x = positionSize / 10;
    const margin20x = positionSize / 20;
    const margin30x = positionSize / 30;

    return {
      positionSize,
      margin10x,
      margin20x,
      margin30x,
      targetProfit,
      targetPercentage
    };
  };

  const results = calculate();

  return (
    <div className="p-6 max-w-4xl mx-auto w-full flex flex-col gap-6 font-sans">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white tracking-tight">Calculadora de Risco</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Formulário */}
        <div className="bg-surface border border-border p-5 rounded-xl shadow flex flex-col gap-4">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">
              Stop Loss (%)
            </label>
            <input
              type="number"
              step="0.01"
              value={stopPercentage}
              onChange={(e) => setStopPercentage(e.target.value)}
              placeholder="Ex: 2.5"
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1 block">
              Valor do Stop (USDT)
            </label>
            <input
              type="number"
              step="0.01"
              value={stopValue}
              onChange={(e) => setStopValue(e.target.value)}
              placeholder="Ex: 50"
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-text-main focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-2 block">
              Risco / Retorno
            </label>
            <div className="flex gap-3">
              {[2, 3, 4].map((rr) => (
                <button
                  key={rr}
                  onClick={() => setRiskReward(rr)}
                  className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors border ${
                    riskReward === rr
                      ? 'bg-accent/20 border-accent text-accent'
                      : 'bg-surface-light border-border text-text-dim hover:text-white'
                  }`}
                >
                  {rr}x1
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Resultados */}
        <div className="bg-surface border border-border p-5 rounded-xl shadow flex flex-col justify-center gap-6">
          {results ? (
            <>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-text-dim font-medium mb-1">
                  Tamanho da Posição (Margem × Alavancagem)
                </div>
                <div className="text-3xl font-mono font-bold text-white">
                  {results.positionSize.toFixed(2)} <span className="text-lg text-text-dim">USDT</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-light border border-border/50 p-4 rounded-lg flex flex-col gap-3">
                  <div className="text-[10px] uppercase tracking-wider text-text-dim font-medium">
                    Margem Necessária (Entrada)
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-white">10x</span>
                    <span className="text-sm font-mono text-[#EAB308] font-bold">{results.margin10x.toFixed(2)} USDT</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-white">20x</span>
                    <span className="text-sm font-mono text-[#EAB308] font-bold">{results.margin20x.toFixed(2)} USDT</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-white">30x</span>
                    <span className="text-sm font-mono text-[#EAB308] font-bold">{results.margin30x.toFixed(2)} USDT</span>
                  </div>
                </div>

                <div className="bg-surface-light border border-border/50 p-4 rounded-lg flex flex-col justify-center">
                  <div className="text-[10px] uppercase tracking-wider text-text-dim font-medium mb-1">
                    Alvo da Operação ({results.targetPercentage.toFixed(2)}%)
                  </div>
                  <div className="text-xl font-mono font-bold text-[#10B981]">
                    + {results.targetProfit.toFixed(2)} USDT
                  </div>
                  <div className="text-xs text-text-dim mt-1">Baseado no R/R {riskReward}x1</div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-text-dim text-center text-sm">
              Preencha o percentual e o valor do stop para ver os cálculos.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RiskCalculator;
