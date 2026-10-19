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
  [key: string]: any;
}

interface OrderBlockRadarProps {
  data: CryptoDataWithSmc[];
  multiData: Record<string, Record<string, CryptoDataWithSmc>>;
  pinnedCoins: string[];
  setPinnedCoins: React.Dispatch<React.SetStateAction<string[]>>;
  onSelectCoin?: (coin: any) => void;
}

const TF_ORDER = ['1d', '4h', '1h', '30m', '15m', '5m'];
const TF_WEIGHT: Record<string, number> = {
  '1D': 6,
  '4H': 5,
  '1H': 4,
  '30M': 3,
  '15M': 2,
  '5M': 1,
};

const formatPrice = (p: number) => {
  if (!p) return '$0.00';
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

export interface ObAlert {
  tf: string;
  type: 'BULLISH' | 'BEARISH';
  zoneType: string;
  top: number;
  bottom: number;
  hasFvg: boolean;
  rsi?: number;
}

export const OrderBlockRadar: React.FC<OrderBlockRadarProps> = ({
  data,
  multiData,
  pinnedCoins,
  setPinnedCoins,
  onSelectCoin
}) => {
  const [showTable, setShowTable] = useState(true);
  const [filter, setFilter] = useState<'Alerts' | 'All' | 'Bullish' | 'Bearish'>('Alerts');
  const [sortBy, setSortBy] = useState<'timeframe' | 'ticker' | 'marketCap'>('timeframe');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (column: 'ticker' | 'timeframe' | 'marketCap') => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder(column === 'marketCap' || column === 'timeframe' ? 'desc' : 'asc');
    }
  };

  // Process all coins and collect active SMC touches per timeframe
  const processedCoins = useMemo(() => {
    return data.map(coin => {
      const ticker = coin.ticker;
      const tfs = multiData[ticker] || {};

      const obAlerts: ObAlert[] = [];

      // Check each timeframe in order 1D down to 5M
      for (const tf of TF_ORDER) {
        const tfData = tfs[tf] || (tf === '1h' ? coin : null);
        if (tfData && tfData.smc) {
          const activeZones = (tfData.smc.activeZones || []).filter(z => z && z.isInside);
          if (activeZones.length > 0) {
            const bullZone = activeZones.find(z => z.type.startsWith('BULLISH'));
            const bearZone = activeZones.find(z => z.type.startsWith('BEARISH'));

            if (bullZone) {
              obAlerts.push({
                tf: tf.toUpperCase(),
                type: 'BULLISH',
                zoneType: bullZone.hasFvg ? 'Bullish OB + FVG' : 'Bullish OB',
                top: bullZone.top,
                bottom: bullZone.bottom,
                hasFvg: bullZone.hasFvg,
                rsi: tfData.rsi
              });
            } else if (bearZone) {
              obAlerts.push({
                tf: tf.toUpperCase(),
                type: 'BEARISH',
                zoneType: bearZone.hasFvg ? 'Bearish OB + FVG' : 'Bearish OB',
                top: bearZone.top,
                bottom: bearZone.bottom,
                hasFvg: bearZone.hasFvg,
                rsi: tfData.rsi
              });
            }
          }
        }
      }

      const hasBullish = obAlerts.some(a => a.type === 'BULLISH');
      const hasBearish = obAlerts.some(a => a.type === 'BEARISH');

      return {
        ...coin,
        tfs,
        obAlerts,
        hasBullish,
        hasBearish
      };
    });
  }, [data, multiData]);

  // Filter
  const filteredCoins = useMemo(() => {
    return processedCoins.filter(coin => {
      const ticker = coin.ticker;
      const isPinned = pinnedCoins.includes(ticker);
      if (isPinned) return true;

      if (filter === 'All') return true;
      if (filter === 'Alerts') return coin.obAlerts.length > 0;
      if (filter === 'Bullish') return coin.hasBullish;
      if (filter === 'Bearish') return coin.hasBearish;
      return true;
    });
  }, [processedCoins, filter, pinnedCoins]);

  // Sort: Default TIMEFRAME ↓ 1D→5M, tie-break A-Z
  const sortedCoins = useMemo(() => {
    return [...filteredCoins].sort((a, b) => {
      const aPinned = pinnedCoins.includes(a.ticker);
      const bPinned = pinnedCoins.includes(b.ticker);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      if (sortBy === 'timeframe') {
        const maxLen = Math.max(a.obAlerts.length, b.obAlerts.length);
        for (let i = 0; i < maxLen; i++) {
          const weightA = a.obAlerts[i] ? (TF_WEIGHT[a.obAlerts[i].tf] || 0) : 0;
          const weightB = b.obAlerts[i] ? (TF_WEIGHT[b.obAlerts[i].tf] || 0) : 0;
          if (weightA !== weightB) {
            return sortOrder === 'desc' ? weightB - weightA : weightA - weightB;
          }
        }
        return a.ticker.localeCompare(b.ticker);
      }

      if (sortBy === 'marketCap') {
        return sortOrder === 'desc'
          ? (b.marketCap || 0) - (a.marketCap || 0)
          : (a.marketCap || 0) - (b.marketCap || 0);
      }

      // Default: A-Z by ticker
      return sortOrder === 'desc'
        ? b.ticker.localeCompare(a.ticker)
        : a.ticker.localeCompare(b.ticker);
    });
  }, [filteredCoins, sortBy, sortOrder, pinnedCoins]);

  const totalActive = processedCoins.filter(c => c.obAlerts.length > 0).length;
  const totalBullish = processedCoins.filter(c => c.hasBullish).length;
  const totalBearish = processedCoins.filter(c => c.hasBearish).length;

  return (
    <div className="flex-none w-full bg-surface rounded-xl border border-border p-4 flex flex-col mb-4 overflow-x-auto shadow-sm">
      {/* Header matching Multi-Timeframe layout */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-text-dim uppercase tracking-wider flex items-center gap-2">
          Radar Order Block & FVG (SMC)
          <div className="group relative flex items-center">
            <HelpCircle size={14} className="text-text-dim/50 hover:text-text-main cursor-help transition-colors" />
            <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-[#1a1a1b] shadow-2xl border border-border rounded-lg p-4 text-xs font-normal text-text-dim opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100]">
              <div className="mb-2 font-bold text-text-main text-sm">Radar Order Block & FVG (SMC)</div>
              <p className="text-xs text-text-dim leading-relaxed mb-3">
                Rastreamento simultâneo nos tempos gráficos 1D, 4H, 1H, 30M, 15M e 5M quando o preço do ativo toca e negocia dentro da zona institucional de um Order Block ou Fair Value Gap.
              </p>
              <div className="space-y-2">
                <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded p-2.5 flex items-start gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#10B981] shrink-0 mt-0.5 shadow-[0_0_6px_rgba(16,185,129,0.8)]"></div>
                  <div>
                    <div className="font-bold text-[#10B981] text-xs">Bullish OB / Demanda (Suporte)</div>
                    <div className="text-[11px] text-text-dim mt-0.5">
                      Preço dentro do bloco de compra institucional com FVG. O timeframe é destacado em <span className="text-[#10B981] font-semibold">verde</span> na coluna TIMEFRAME.
                    </div>
                  </div>
                </div>
                <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded p-2.5 flex items-start gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shrink-0 mt-0.5 shadow-[0_0_6px_rgba(239,68,68,0.8)]"></div>
                  <div>
                    <div className="font-bold text-[#EF4444] text-xs">Bearish OB / Oferta (Resistência)</div>
                    <div className="text-[11px] text-text-dim mt-0.5">
                      Preço dentro do bloco de venda institucional com FVG. O timeframe é destacado em <span className="text-[#EF4444] font-semibold">vermelho</span> na coluna TIMEFRAME.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </h2>

        {/* Right side controls matching Multi-Timeframe */}
        <div className="flex items-center gap-4 text-[10px]">
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="bg-surface-light border border-border px-2 py-1 rounded text-xs text-text-main cursor-pointer outline-none focus:border-accent mr-2"
          >
            <option value="Alerts">Com Alerta ({totalActive} Ativos)</option>
            <option value="All">Todas as Moedas</option>
            <option value="Bullish">Apenas Bullish Demanda ({totalBullish})</option>
            <option value="Bearish">Apenas Bearish Oferta ({totalBearish})</option>
          </select>

          <div className="flex items-center gap-1.5" title="Preço dentro do Order Block de Demanda / Compra (OB+)">
            <div className="w-2.5 h-2.5 rounded-full bg-[#10B981] shadow-[0_0_6px_rgba(16,185,129,0.8)]"></div>
            <span className="font-semibold text-[#10B981]">OB+ (Demanda)</span>
          </div>

          <div className="flex items-center gap-1.5" title="Preço dentro do Order Block de Oferta / Venda (OB-)">
            <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shadow-[0_0_6px_rgba(239,68,68,0.8)]"></div>
            <span className="font-semibold text-[#EF4444]">OB- (Oferta)</span>
          </div>

          <button onClick={() => setShowTable(!showTable)} className="p-1 hover:bg-surface-light rounded transition-colors text-text-dim ml-2">
            {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Table with EXACT columns: Cripto > TIMEFRAME > Market Cap > 5M > 15M > 30M > 1H > 4H > 1D */}
      {showTable && (
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="text-text-dim border-b border-border">
            <tr>
              {/* 1. CRIPTO */}
              <th 
                onClick={() => handleSort('ticker')} 
                className="py-2 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                title="Clique para ordenar por Cripto (A-Z / Z-A)"
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

              {/* 2. TIMEFRAME */}
              <th 
                onClick={() => handleSort('timeframe')} 
                className="py-2 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                title="Clique para ordenar por Timeframe (Maior → Menor)"
              >
                <div className="flex items-center gap-1.5">
                  <span>TIMEFRAME</span>
                  {sortBy === 'timeframe' && (
                    <span className="text-[10px] text-accent font-bold">
                      {sortOrder === 'desc' ? '↓ 1D→5M' : '↑ 5M→1D'}
                    </span>
                  )}
                </div>
              </th>

              {/* 3. MARKET CAP */}
              <th 
                onClick={() => handleSort('marketCap')} 
                className="py-2 px-4 font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                title="Clique para ordenar por Market Cap"
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

              {/* 4. 5M */}
              <th className="py-2 px-4 font-semibold uppercase tracking-wider">5M</th>

              {/* 5. 15M */}
              <th className="py-2 px-4 font-semibold uppercase tracking-wider">15M</th>

              {/* 6. 30M */}
              <th className="py-2 px-4 font-semibold uppercase tracking-wider">30M</th>

              {/* 7. 1H */}
              <th className="py-2 px-4 font-semibold uppercase tracking-wider">1H</th>

              {/* 8. 4H */}
              <th className="py-2 px-4 font-semibold uppercase tracking-wider">4H</th>

              {/* 9. 1D */}
              <th className="py-2 px-4 font-semibold uppercase tracking-wider">1D</th>

              {/* 10. Actions / Pin */}
              <th className="py-2 px-4 font-semibold uppercase tracking-wider w-8"></th>
            </tr>
          </thead>

          <tbody className="font-mono">
            {sortedCoins.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-text-dim text-xs">
                  Nenhuma criptomoeda tocando a zona de Order Block/FVG com os filtros selecionados no momento.
                </td>
              </tr>
            ) : (
              sortedCoins.map(coin => {
                const ticker = coin.ticker;
                const tfs = coin.tfs;
                const isPinned = pinnedCoins.includes(ticker);
                const { obAlerts, hasBullish, hasBearish } = coin;

                let rowClasses = "border-b border-border hover:bg-surface-light transition-all cursor-pointer group";
                if (hasBullish && !hasBearish) {
                  rowClasses = "border-b border-border hover:bg-surface-light border-l-4 border-l-[#10B981] bg-[#10B981]/5 transition-all cursor-pointer group";
                } else if (hasBearish && !hasBullish) {
                  rowClasses = "border-b border-border hover:bg-surface-light border-l-4 border-l-[#EF4444] bg-[#EF4444]/5 transition-all cursor-pointer group";
                } else if (hasBullish && hasBearish) {
                  rowClasses = "border-b border-border hover:bg-surface-light border-l-4 border-l-amber-500 bg-amber-500/5 transition-all cursor-pointer group";
                } else if (isPinned) {
                  rowClasses += " border-l-4 border-l-accent";
                }

                return (
                  <tr
                    key={ticker}
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
                      <span className="text-xs text-text-dim font-normal truncate max-w-[120px] hidden sm:inline">
                        {coin.name}
                      </span>
                    </td>

                    {/* 2. TIMEFRAME */}
                    <td className="py-2.5 px-4 font-mono text-xs whitespace-nowrap">
                      {obAlerts.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {obAlerts.map((alert, idx) => (
                            <span
                              key={idx}
                              title={`${alert.tf}: ${alert.zoneType} [${formatPrice(alert.bottom)} - ${formatPrice(alert.top)}]`}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wide border shadow-sm ${
                                alert.type === 'BULLISH'
                                  ? 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]/50 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                                  : 'bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/50 shadow-[0_0_8px_rgba(239,68,68,0.25)]'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${alert.type === 'BULLISH' ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`}></span>
                              {alert.tf}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-text-dim/30">-</span>
                      )}
                    </td>

                    {/* 3. MARKET CAP */}
                    <td className="py-2.5 px-4 text-text-dim font-mono">
                      {formatMarketCap(coin.marketCap)}
                    </td>

                    {/* 4 to 9. 5M, 15M, 30M, 1H, 4H, 1D Order Block Status */}
                    {['5m', '15m', '30m', '1h', '4h', '1d'].map(tf => {
                      const item = tfs[tf];
                      const activeZones = (item?.smc?.activeZones || []).filter(z => z && z.isInside);
                      const bullZone = activeZones.find(z => z.type.startsWith('BULLISH'));
                      const bearZone = activeZones.find(z => z.type.startsWith('BEARISH'));

                      if (bullZone) {
                        return (
                          <td key={tf} className="py-2.5 px-4">
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/50 shadow-[0_0_8px_rgba(16,185,129,0.3)] select-none"
                              title={`${tf.toUpperCase()}: ${bullZone.hasFvg ? 'Bullish OB + FVG' : 'Bullish OB'} [${formatPrice(bullZone.bottom)} - ${formatPrice(bullZone.top)}] • Preço dentro do bloco`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
                              OB+
                            </span>
                          </td>
                        );
                      }

                      if (bearZone) {
                        return (
                          <td key={tf} className="py-2.5 px-4">
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/50 shadow-[0_0_8px_rgba(239,68,68,0.3)] select-none"
                              title={`${tf.toUpperCase()}: ${bearZone.hasFvg ? 'Bearish OB + FVG' : 'Bearish OB'} [${formatPrice(bearZone.bottom)} - ${formatPrice(bearZone.top)}] • Preço dentro do bloco`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]"></span>
                              OB-
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td key={tf} className="py-2.5 px-4 text-text-dim/20 font-mono">
                          -
                        </td>
                      );
                    })}

                    {/* 10. Actions / Pin */}
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
