import React, { useState, useMemo } from 'react';
import { HelpCircle, ChevronUp, ChevronDown, Pin, X } from 'lucide-react';

export interface SmcZone {
  type: 'BULLISH_OB' | 'BEARISH_OB' | 'BULLISH_FVG' | 'BEARISH_FVG';
  top: number;
  bottom: number;
  mid: number;
  isInside: boolean;
  distancePct: number;
  penetrationPct: number;
  mitigationPct?: number;
  hasFvg: boolean;
  candleIndex?: number;
}

export interface SmcResult {
  activeZones: SmcZone[];
  nearestBullish?: SmcZone;
  nearestBearish?: SmcZone;
}

export interface CryptoDataWithSmc {
  id: string;
  symbol: string;
  name: string;
  ticker: string;
  rsi: number;
  price: number;
  priceChange: number;
  marketCap: number;
  zone: string;
  smc?: SmcResult;
  timeframe?: string;
  [key: string]: any;
}

interface OrderBlockRadarProps {
  data: CryptoDataWithSmc[];
  multiData: Record<string, Record<string, CryptoDataWithSmc>>;
  pinnedCoins: string[];
  setPinnedCoins: React.Dispatch<React.SetStateAction<string[]>>;
  onSelectCoin?: (coin: any) => void;
}

const formatPrice = (p: number) => {
  if (!p && p !== 0) return '$0.00';
  if (p >= 1000) return `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(3)}`;
  if (p >= 0.001) return `$${p.toFixed(5)}`;
  return `$${p.toFixed(7)}`;
};

const formatMarketCap = (marketCap: number) => {
  if (!marketCap) return '$0';
  if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(2)}T`;
  if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
  if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
  return `$${marketCap.toLocaleString()}`;
};

export const OrderBlockRadar: React.FC<OrderBlockRadarProps> = ({
  data,
  multiData,
  pinnedCoins,
  setPinnedCoins,
  onSelectCoin
}) => {
  const [showTable, setShowTable] = useState(true);
  const [filter, setFilter] = useState<'Alerts' | 'All' | 'Bullish' | 'Bearish'>('Alerts');
  const [sortBy, setSortBy] = useState<'mitigation' | 'ticker' | 'marketCap' | 'signal'>('mitigation');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (column: 'ticker' | 'mitigation' | 'marketCap' | 'signal') => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder(column === 'ticker' ? 'asc' : 'desc');
    }
  };

  // Process all coins focusing EXCLUSIVELY on 4H timeframe
  const processedCoins = useMemo(() => {
    const seen = new Set<string>();
    const uniqueData = data.filter(c => {
      if (!c || !c.ticker) return false;
      const sym = c.ticker.toUpperCase();
      if (seen.has(sym)) return false;
      seen.add(sym);
      return true;
    });

    return uniqueData.map(coin => {
      const ticker = coin.ticker.toUpperCase();
      const tfs = multiData[ticker] || {};
      
      // Exclusively monitor 4H
      const data4h = tfs['4h'] || (coin.timeframe === '4h' ? coin : null) || coin;
      const smc = data4h?.smc;

      // Check active zones on 4H
      const activeInsideZones = (smc?.activeZones || []).filter((z: SmcZone) => z && z.isInside);
      const activeBull = activeInsideZones.find((z: SmcZone) => z.type.startsWith('BULLISH'));
      const activeBear = activeInsideZones.find((z: SmcZone) => z.type.startsWith('BEARISH'));

      const nearestBull = smc?.nearestBullish;
      const nearestBear = smc?.nearestBearish;

      let primaryZone: SmcZone | null = null;
      let alertType: 'BULLISH' | 'BEARISH' | null = null;
      let isInside = false;

      if (activeBull) {
        primaryZone = activeBull;
        alertType = 'BULLISH';
        isInside = true;
      } else if (activeBear) {
        primaryZone = activeBear;
        alertType = 'BEARISH';
        isInside = true;
      } else if (nearestBull && (!nearestBear || (nearestBull.distancePct || 0) <= (nearestBear.distancePct || 0))) {
        primaryZone = nearestBull;
        alertType = 'BULLISH';
        isInside = false;
      } else if (nearestBear) {
        primaryZone = nearestBear;
        alertType = 'BEARISH';
        isInside = false;
      }

      // Mitigation % calculation (0 to 100%)
      let mitigation = 0;
      if (primaryZone) {
        const rawMit = primaryZone.mitigationPct ?? primaryZone.penetrationPct ?? 0;
        mitigation = Math.min(100, Math.max(0, Math.round(rawMit)));
      }

      const currentPrice = data4h?.price || coin.price || 0;

      return {
        ...coin,
        price: currentPrice,
        data4h,
        primaryZone,
        alertType,
        isInside,
        mitigation,
        hasBullish: alertType === 'BULLISH' && isInside,
        hasBearish: alertType === 'BEARISH' && isInside,
        hasZone: primaryZone !== null
      };
    });
  }, [data, multiData]);

  // Filter for 4H
  const filteredCoins = useMemo(() => {
    return processedCoins.filter(coin => {
      const ticker = coin.ticker;
      const isPinned = pinnedCoins.includes(ticker);
      if (isPinned) return true;

      if (filter === 'All') return coin.hasZone;
      if (filter === 'Alerts') return coin.isInside;
      if (filter === 'Bullish') return coin.hasBullish;
      if (filter === 'Bearish') return coin.hasBearish;
      return true;
    });
  }, [processedCoins, filter, pinnedCoins]);

  // Sort
  const sortedCoins = useMemo(() => {
    return [...filteredCoins].sort((a, b) => {
      const aPinned = pinnedCoins.includes(a.ticker);
      const bPinned = pinnedCoins.includes(b.ticker);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      if (sortBy === 'mitigation') {
        if (a.isInside !== b.isInside) {
          return a.isInside ? -1 : 1;
        }
        return sortOrder === 'desc'
          ? b.mitigation - a.mitigation
          : a.mitigation - b.mitigation;
      }

      if (sortBy === 'marketCap') {
        return sortOrder === 'desc'
          ? (b.marketCap || 0) - (a.marketCap || 0)
          : (a.marketCap || 0) - (b.marketCap || 0);
      }

      if (sortBy === 'signal') {
        const valA = a.isInside ? (a.alertType === 'BULLISH' ? 2 : 1) : 0;
        const valB = b.isInside ? (b.alertType === 'BULLISH' ? 2 : 1) : 0;
        if (valA !== valB) {
          return sortOrder === 'desc' ? valB - valA : valA - valB;
        }
        return a.ticker.localeCompare(b.ticker);
      }

      // Default: A-Z by ticker
      return sortOrder === 'desc'
        ? b.ticker.localeCompare(a.ticker)
        : a.ticker.localeCompare(b.ticker);
    });
  }, [filteredCoins, sortBy, sortOrder, pinnedCoins]);

  const totalActive = processedCoins.filter(c => c.isInside).length;
  const totalBullish = processedCoins.filter(c => c.hasBullish).length;
  const totalBearish = processedCoins.filter(c => c.hasBearish).length;

  return (
    <div className="flex-none w-full bg-surface rounded-xl border border-border p-4 flex flex-col mb-4 overflow-x-auto shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-text-dim uppercase tracking-wider flex items-center gap-2">
          <span>Radar Order Block & FVG (SMC)</span>
          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/40 font-mono">
            4H
          </span>
          <div className="group relative flex items-center">
            <HelpCircle size={14} className="text-text-dim/50 hover:text-text-main cursor-help transition-colors" />
            <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-[#1a1a1b] shadow-2xl border border-border rounded-lg p-4 text-xs font-normal text-text-dim opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100]">
              <div className="mb-2 font-bold text-text-main text-sm flex items-center gap-1.5">
                <span>Radar Order Block & FVG (SMC) • 4H</span>
              </div>
              <p className="text-xs text-text-dim leading-relaxed mb-3">
                Monitoramento exclusivo no tempo gráfico institucional de <strong>4 Horas (4H)</strong>. Detecta zonas de Order Block acompanhadas de Fair Value Gap (FVG) e calcula em tempo real o nível exato de <strong>Mitigação (0% a 100%)</strong>.
              </p>
              <div className="space-y-2">
                <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded p-2.5 flex items-start gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#10B981] shrink-0 mt-0.5 shadow-[0_0_6px_rgba(16,185,129,0.8)]"></div>
                  <div>
                    <div className="font-bold text-[#10B981] text-xs">OB+ Demanda (Compra institucional)</div>
                    <div className="text-[11px] text-text-dim mt-0.5">
                      Preço dentro do bloco de suporte de 4H. A barra mede o quanto o preço penetrou no bloco em direção ao fundo.
                    </div>
                  </div>
                </div>
                <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded p-2.5 flex items-start gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shrink-0 mt-0.5 shadow-[0_0_6px_rgba(239,68,68,0.8)]"></div>
                  <div>
                    <div className="font-bold text-[#EF4444] text-xs">OB- Oferta (Venda institucional)</div>
                    <div className="text-[11px] text-text-dim mt-0.5">
                      Preço dentro do bloco de resistência de 4H. A barra mede o quanto o preço penetrou no bloco em direção ao topo.
                    </div>
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded p-2 text-[11px] text-text-dim">
                  <strong className="text-text-main">Linha Central (50% MT):</strong> Marca o <em>Mean Threshold</em> (ponto de equilíbrio do Order Block), nível crítico de reação e defesa institucional.
                </div>
              </div>
            </div>
          </div>
        </h2>

        {/* Right side controls */}
        <div className="flex items-center gap-3 text-[10px]">
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="bg-surface-light border border-border px-2 py-1 rounded text-xs text-text-main cursor-pointer outline-none focus:border-accent mr-1"
          >
            <option value="Alerts">Com Alerta 4H ({totalActive} Ativos)</option>
            <option value="All">Todas as Moedas</option>
            <option value="Bullish">Apenas Bullish Demanda ({totalBullish})</option>
            <option value="Bearish">Apenas Bearish Oferta ({totalBearish})</option>
          </select>

          <div className="hidden sm:flex items-center gap-1.5" title="Preço dentro do Order Block de Demanda (OB+) no 4H">
            <div className="w-2.5 h-2.5 rounded-full bg-[#10B981] shadow-[0_0_6px_rgba(16,185,129,0.8)]"></div>
            <span className="font-semibold text-[#10B981]">OB+ (4H)</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5" title="Preço dentro do Order Block de Oferta (OB-) no 4H">
            <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shadow-[0_0_6px_rgba(239,68,68,0.8)]"></div>
            <span className="font-semibold text-[#EF4444]">OB- (4H)</span>
          </div>

          <button onClick={() => setShowTable(!showTable)} className="p-1 hover:bg-surface-light rounded transition-colors text-text-dim ml-1">
            {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Table: Cripto > Sinal (4H) > Preço Atual > Zona OB (4H) > Market Cap > Barra de Mitigação (0 a 100%) > Pin */}
      {showTable && (
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="text-text-dim border-b border-border">
            <tr>
              {/* 1. CRIPTO */}
              <th 
                onClick={() => handleSort('ticker')} 
                className="py-2.5 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                title="Ordenar por Criptomoeda (A-Z / Z-A)"
              >
                <div className="flex items-center gap-1.5">
                  <span>Cripto</span>
                  {sortBy === 'ticker' && (
                    <span className="text-[10px] text-accent font-bold">
                      {sortOrder === 'asc' ? '↑ A-Z' : '↓ Z-A'}
                    </span>
                  )}
                </div>
              </th>

              {/* 2. SINAL (4H) */}
              <th 
                onClick={() => handleSort('signal')} 
                className="py-2.5 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                title="Ordenar por Sinal (OB+ / OB-)"
              >
                <div className="flex items-center gap-1.5">
                  <span>Sinal (4H)</span>
                  {sortBy === 'signal' && (
                    <span className="text-[10px] text-accent font-bold">
                      {sortOrder === 'desc' ? '↓' : '↑'}
                    </span>
                  )}
                </div>
              </th>

              {/* 3. PREÇO ATUAL */}
              <th className="py-2.5 px-4 font-semibold uppercase tracking-wider">
                Preço Atual
              </th>

              {/* 4. FAIXA OB 4H */}
              <th className="py-2.5 px-4 font-semibold uppercase tracking-wider" title="Faixa de preço da zona institucional no 4H">
                Zona OB 4H
              </th>

              {/* 5. MARKET CAP */}
              <th 
                onClick={() => handleSort('marketCap')} 
                className="py-2.5 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                title="Ordenar por Market Cap"
              >
                <div className="flex items-center gap-1.5">
                  <span>Market Cap</span>
                  {sortBy === 'marketCap' && (
                    <span className="text-[10px] text-accent font-bold">
                      {sortOrder === 'desc' ? '↓' : '↑'}
                    </span>
                  )}
                </div>
              </th>

              {/* 6. BARRA DE MITIGAÇÃO 0 A 100% */}
              <th 
                onClick={() => handleSort('mitigation')} 
                className="py-2.5 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors min-w-[260px]"
                title="Barra de Mitigação de 0% a 100% no 4H (Clique para ordenar)"
              >
                <div className="flex items-center gap-2">
                  <span>Barra de Mitigação (0 a 100%)</span>
                  {sortBy === 'mitigation' && (
                    <span className="text-[10px] text-accent font-bold">
                      {sortOrder === 'desc' ? '↓ 100%→0%' : '↑ 0%→100%'}
                    </span>
                  )}
                </div>
              </th>

              {/* 7. PIN */}
              <th className="py-2.5 px-4 font-semibold uppercase tracking-wider w-8 text-right"></th>
            </tr>
          </thead>

          <tbody className="font-mono">
            {sortedCoins.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-text-dim text-xs">
                  Nenhuma criptomoeda tocando a zona de Order Block/FVG no tempo de 4H com os filtros atuais.
                </td>
              </tr>
            ) : (
              sortedCoins.map((coin, index) => {
                const ticker = coin.ticker;
                const isPinned = pinnedCoins.includes(ticker);
                const { primaryZone, alertType, isInside, mitigation, hasBullish, hasBearish } = coin;

                let rowClasses = "border-b border-border hover:bg-surface-light transition-all cursor-pointer group";
                if (hasBullish) {
                  rowClasses = "border-b border-border hover:bg-surface-light border-l-4 border-l-[#10B981] bg-[#10B981]/5 transition-all cursor-pointer group";
                } else if (hasBearish) {
                  rowClasses = "border-b border-border hover:bg-surface-light border-l-4 border-l-[#EF4444] bg-[#EF4444]/5 transition-all cursor-pointer group";
                } else if (isPinned) {
                  rowClasses += " border-l-4 border-l-accent";
                }

                return (
                  <tr
                    key={`${ticker}-${coin.id || index}`}
                    className={rowClasses}
                    onClick={() => {
                      if (onSelectCoin) onSelectCoin(coin);
                    }}
                  >
                    {/* 1. CRIPTO */}
                    <td className="py-2.5 px-4 font-sans font-bold flex items-center gap-2">
                      <div className="flex items-center gap-1.5 min-w-[3.5rem]">
                        {isPinned && <Pin size={12} className="text-accent fill-accent rotate-45 shrink-0" />}
                        <span className="text-sm font-extrabold">{ticker}</span>
                      </div>
                      <span className="text-xs text-text-dim font-normal truncate max-w-[130px] hidden sm:inline">
                        {coin.name}
                      </span>
                    </td>

                    {/* 2. SINAL (4H) */}
                    <td className="py-2.5 px-4">
                      {isInside && alertType === 'BULLISH' ? (
                        <span 
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/50 shadow-[0_0_8px_rgba(16,185,129,0.25)]"
                          title="Preço dentro do bloco de Demanda (Compra) no 4H"
                        >
                          <span className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_6px_rgba(16,185,129,0.8)]"></span>
                          <span>OB+ Demanda</span>
                          {primaryZone?.hasFvg && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-[#10B981]/30 border border-[#10B981]/50">
                              +FVG
                            </span>
                          )}
                        </span>
                      ) : isInside && alertType === 'BEARISH' ? (
                        <span 
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/50 shadow-[0_0_8px_rgba(239,68,68,0.25)]"
                          title="Preço dentro do bloco de Oferta (Venda) no 4H"
                        >
                          <span className="w-2 h-2 rounded-full bg-[#EF4444] shadow-[0_0_6px_rgba(239,68,68,0.8)]"></span>
                          <span>OB- Oferta</span>
                          {primaryZone?.hasFvg && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-[#EF4444]/30 border border-[#EF4444]/50">
                              +FVG
                            </span>
                          )}
                        </span>
                      ) : primaryZone ? (
                        <span className="text-text-dim/60 text-[11px] font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-text-dim/40"></span>
                          {alertType === 'BULLISH' ? 'Demanda (Próx)' : 'Oferta (Próx)'}
                        </span>
                      ) : (
                        <span className="text-text-dim/30">-</span>
                      )}
                    </td>

                    {/* 3. PREÇO ATUAL */}
                    <td className="py-2.5 px-4 font-mono font-bold text-text-main">
                      {formatPrice(coin.price)}
                    </td>

                    {/* 4. FAIXA OB 4H */}
                    <td className="py-2.5 px-4 font-mono text-xs text-text-dim">
                      {primaryZone ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-text-main font-semibold">
                            {formatPrice(primaryZone.bottom)} ~ {formatPrice(primaryZone.top)}
                          </span>
                          <span className="text-[10px] text-text-dim/70">
                            MT (50%): {formatPrice(primaryZone.mid)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-text-dim/30">-</span>
                      )}
                    </td>

                    {/* 5. MARKET CAP */}
                    <td className="py-2.5 px-4 text-text-dim font-mono">
                      {formatMarketCap(coin.marketCap)}
                    </td>

                    {/* 6. BARRA DE MITIGAÇÃO DE 0 A 100% */}
                    <td className="py-2.5 px-4 min-w-[260px]">
                      {primaryZone ? (
                        <div 
                          className="flex items-center gap-3"
                          title={`Mitigação 4H: ${mitigation}%\nEntrada do Bloco: ${formatPrice(alertType === 'BULLISH' ? primaryZone.top : primaryZone.bottom)}\nEquilíbrio 50%: ${formatPrice(primaryZone.mid)}\nFundo/Topo Invalidação: ${formatPrice(alertType === 'BULLISH' ? primaryZone.bottom : primaryZone.top)}`}
                        >
                          {/* Barra Visual de 0% a 100% */}
                          <div className="relative flex-1 h-3.5 bg-black/60 border border-border/80 rounded-full overflow-hidden shadow-inner flex items-center">
                            {/* Marcação central de 50% (Mean Threshold) */}
                            <div 
                              className="absolute left-1/2 top-0 bottom-0 w-[1.5px] bg-white/40 z-10 pointer-events-none"
                              style={{ transform: 'translateX(-50%)' }}
                              title="50% Mean Threshold (Equilíbrio)"
                            />

                            {/* Marcação de 25% e 75% discretas */}
                            <div className="absolute left-1/4 top-0 bottom-0 w-px bg-white/10 z-10 pointer-events-none" />
                            <div className="absolute left-3/4 top-0 bottom-0 w-px bg-white/10 z-10 pointer-events-none" />

                            {/* Preenchimento da barra com gradiente */}
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                alertType === 'BULLISH'
                                  ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                                  : alertType === 'BEARISH'
                                  ? 'bg-gradient-to-r from-red-700 via-rose-500 to-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                                  : 'bg-zinc-600'
                              }`}
                              style={{ width: `${Math.max(mitigation, isInside ? 4 : 0)}%` }}
                            />
                          </div>

                          {/* Percentual e Tag de Estado */}
                          <div className="flex items-center gap-1.5 min-w-[85px]">
                            <span className={`font-mono font-extrabold text-xs ${
                              alertType === 'BULLISH'
                                ? 'text-emerald-400'
                                : alertType === 'BEARISH'
                                ? 'text-rose-400'
                                : 'text-text-dim'
                            }`}>
                              {mitigation}%
                            </span>

                            {isInside ? (
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-sans font-bold uppercase tracking-tight ${
                                mitigation >= 85
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : mitigation >= 45 && mitigation <= 55
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                  : mitigation < 30
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}>
                                {mitigation >= 85 ? 'Exausto' : mitigation >= 45 && mitigation <= 55 ? '50% MT' : mitigation < 30 ? 'Fresco' : 'Mitigando'}
                              </span>
                            ) : (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-white/5 text-text-dim/60">
                                {primaryZone.distancePct ? `${primaryZone.distancePct.toFixed(1)}% fora` : 'fora'}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-text-dim/30 text-xs">-</div>
                      )}
                    </td>

                    {/* 7. PIN / AÇÕES */}
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
              })
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};
