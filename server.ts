import express from 'express';
import cors from 'cors';
import axios from 'axios';
import NodeCache from 'node-cache';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json());

const cache = new NodeCache({ stdTTL: 180 }); // Cache for 180 seconds

let baseCoinsPromise: Promise<any[]> | null = null;
async function getBaseCoins(): Promise<any[]> {
  let coins: any[] | undefined = cache.get('base-coins');
  if (coins && coins.length > 0) return coins;

  if (baseCoinsPromise) return baseCoinsPromise;

  baseCoinsPromise = (async () => {
    try {
      const cgResponse = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 250, // Get max for sorting and filtering
          page: 1
        },
        timeout: 10000
      });
      let resultCoins = cgResponse.data.map((c: any) => ({
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        market_cap: c.market_cap || 0,
        current_price: c.current_price || 0,
        rank: c.market_cap_rank || 0
      }));
      cache.set('base-coins', resultCoins, 120); // 2 minute cache
      return resultCoins;
    } catch (cgError: any) {
      console.error("CoinGecko failed, falling back to CoinPaprika:", cgError.message);
      try {
        const cpResponse = await axios.get('https://api.coinpaprika.com/v1/tickers', {
          timeout: 10000
        });
        let resultCoins = cpResponse.data
          .sort((a: any, b: any) => (b.quotes?.USD?.market_cap || 0) - (a.quotes?.USD?.market_cap || 0))
          .map((c: any) => ({
            id: c.id,
            symbol: c.symbol.toUpperCase(),
            name: c.name,
            market_cap: c.quotes?.USD?.market_cap || 0,
            current_price: c.quotes?.USD?.price || 0,
            rank: c.rank
          }));
        cache.set('base-coins', resultCoins, 120);
        return resultCoins;
      } catch (cpError: any) {
        console.error("CoinPaprika fallback failed:", cpError.message);
        throw cpError;
      }
    } finally {
      baseCoinsPromise = null;
    }
  })();
  
  return baseCoinsPromise;
}

let binanceSymbolsPromise: Promise<Set<string> | undefined> | null = null;
async function getBinanceSymbols(): Promise<Set<string> | undefined> {
  let binanceSymbols: Set<string> | undefined = cache.get('binance-symbols');
  if (binanceSymbols) return binanceSymbols;

  if (binanceSymbolsPromise) return binanceSymbolsPromise;

  binanceSymbolsPromise = (async () => {
    try {
      const binanceRes = await axios.get('https://api.coinpaprika.com/v1/exchanges/binance/markets', { timeout: 10000 });
      const symbols = binanceRes.data
        .filter((t: any) => t.category === 'Spot') // only spot pairs
        .map((t: any) => t.pair.split('/')[0].toUpperCase());
      const resSet = new Set<string>(symbols);
      cache.set('binance-symbols', resSet, 3600); // cache for 1 hour
      return resSet;
    } catch (err: any) {
      console.error("Failed to fetch Binance symbols:", err.message);
      return undefined;
    } finally {
      binanceSymbolsPromise = null;
    }
  })();

  return binanceSymbolsPromise;
}

let futuresLeveragePromise: Promise<Map<string, number> | undefined> | null = null;
async function getFuturesLeverage(): Promise<Map<string, number> | undefined> {
  let futuresLeverage: Map<string, number> | undefined = cache.get('futures-leverage');
  if (futuresLeverage) return futuresLeverage;

  if (futuresLeveragePromise) return futuresLeveragePromise;

  futuresLeveragePromise = (async () => {
    try {
      const res = await axios.get('https://api-futures.kucoin.com/api/v1/contracts/active', { timeout: 10000 });
      const leverageMap = new Map<string, number>();
      if (res.data && res.data.data) {
        for (const contract of res.data.data) {
          if (contract.quoteCurrency === 'USDT') {
            leverageMap.set(contract.baseCurrency.toUpperCase(), contract.maxLeverage);
          }
        }
      }
      cache.set('futures-leverage', leverageMap, 3600); // 1 hour
      return leverageMap;
    } catch (err: any) {
      console.error("KuCoin futures active contracts failed:", err.message);
      return undefined;
    } finally {
      futuresLeveragePromise = null;
    }
  })();

  return futuresLeveragePromise;
}

// Helper to calculate RSI
function calculateRSI(closes: number[], period: number = 14): number | null {
  if (closes.length <= period) return null;

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain and loss
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate smoothed moving average for the rest
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    let gain = 0;
    let loss = 0;
    
    if (change > 0) {
      gain = change;
    } else {
      loss = -change;
    }

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return rsi;
}

function calculateEMAs(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const emaArray = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    emaArray.push((closes[i] * k) + (emaArray[i - 1] * (1 - k)));
  }
  return emaArray;
}

function calculateRSIHistory(closes: number[], period: number = 14): number[] {
  if (closes.length <= period) return [];

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  let rsiHistory = [];
  
  if (avgLoss === 0) {
    rsiHistory.push(100);
  } else {
    let rs = avgGain / avgLoss;
    rsiHistory.push(100 - (100 / (1 + rs)));
  }

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    let gain = 0;
    let loss = 0;
    
    if (change > 0) {
      gain = change;
    } else {
      loss = -change;
    }

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsiHistory.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsiHistory.push(100 - (100 / (1 + rs)));
    }
  }

  return rsiHistory;
}

function calculateStochRSI(rsiHistory: number[], period: number = 14, kPeriod: number = 3, dPeriod: number = 3): { k: number, d: number } | null {
  if (rsiHistory.length < period) return null;

  const stochRsiHistory = [];
  
  for (let i = period - 1; i < rsiHistory.length; i++) {
    const rsiWindow = rsiHistory.slice(i - period + 1, i + 1);
    const minRsi = Math.min(...rsiWindow);
    const maxRsi = Math.max(...rsiWindow);
    
    let stochRsi = 0;
    if (maxRsi !== minRsi) {
      stochRsi = ((rsiHistory[i] - minRsi) / (maxRsi - minRsi)) * 100;
    }
    stochRsiHistory.push(stochRsi);
  }

  if (stochRsiHistory.length < kPeriod) return null;

  // Simple Moving Average for %K
  const calculateSMA = (data: number[], p: number) => {
    let smas = [];
    for (let i = p - 1; i < data.length; i++) {
      const sum = data.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0);
      smas.push(sum / p);
    }
    return smas;
  };

  const kHistory = calculateSMA(stochRsiHistory, kPeriod);
  
  if (kHistory.length < dPeriod) return null;
  const dHistory = calculateSMA(kHistory, dPeriod);

  return {
    k: kHistory[kHistory.length - 1],
    d: dHistory[dHistory.length - 1]
  };
}
function getZone(rsi: number): string {
  if (rsi > 70) return 'overbought';
  if (rsi >= 60) return 'strong';
  if (rsi > 40) return 'neutral';
  if (rsi >= 30) return 'weak';
  return 'oversold';
}

app.get('/api/crypto-rsi', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const timeframe = (req.query.timeframe as string) || '1h';
    const minMarketCap = parseFloat(req.query.minMarketCap as string) || 0;

    const cacheKey = `crypto-rsi-${limit}-${timeframe}-${minMarketCap}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // 1. Fetch base list to determine rank and market cap
    let coins = await getBaseCoins();

    // Blocklist of symbols to exclude (stablecoins and others requested by user)
    const blocklist = ['HTX', 'USDE', 'ETC', 'U', 'USD1', 'USDC', 'USDD', 'USDS', 'PYUSD', 'USDG', 'XAUT', 'USDT', 'DAI', 'FDUSD', 'TUSD', 'USTC', 'STETH', 'WETH', 'WBTC', 'WEETH', 'USDT', 'BUSD', 'FRAX', 'QNT', 'BTT', 'BTTC'];
    
    // Fetch Binance symbols to filter ONLY Binance coins using Coinpaprika
    let binanceSymbols = await getBinanceSymbols();
    
    // Fetch KuCoin futures leverage map
    let futuresLeverage = await getFuturesLeverage();

    // Filter by min market cap, blocklist, and Binance availability
    coins = coins.filter((c: any) => {
      const meetsMarketCap = minMarketCap > 0 ? c.market_cap >= minMarketCap : true;
      const notBlocked = !blocklist.includes(c.symbol);
      const onBinance = binanceSymbols ? binanceSymbols.has(c.symbol) : true;
      return meetsMarketCap && notBlocked && onBinance;
    });

    // Take top N
    coins = coins.slice(0, limit);

    // 2. Map to KuCoin symbols and fetch candles
    const intervals: Record<string, string> = {
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '1h': '1hour',
      '4h': '4hour',
      '1d': '1day',
      '1w': '1week'
    };
    const interval = intervals[timeframe] || '1hour';
    
    // KuCoin returns 100 default. We need at least 150 for EMA144. Fetch 200.
    const getIntervalSecs = (intv: string) => {
      switch(intv) {
        case '1min': return 60;
        case '5min': return 5 * 60;
        case '15min': return 15 * 60;
        case '30min': return 30 * 60;
        case '1hour': return 3600;
        case '4hour': return 4 * 3600;
        case '1day': return 24 * 3600;
        case '1week': return 7 * 24 * 3600;
        default: return 3600;
      }
    };
    const intervalSecs = getIntervalSecs(interval);
    const endAt = Math.floor(Date.now() / 1000);
    const startAt = endAt - (500 * intervalSecs);

    const results = [];
    const batchSize = 10; // Fetch in 10s to be safe with KuCoin rate limits

    for (let i = 0; i < coins.length; i += batchSize) {
      const batch = coins.slice(i, i + batchSize);
      
      const promises = batch.map(async (coin: any, index: number) => {
        try {
          const ticker = coin.symbol;
          const symbol = `${ticker}-USDT`; // KuCoin uses DASH e.g BTC-USDT
          
          const binanceInterval = timeframe;
          
          const binanceRes = await axios.get('https://data-api.binance.vision/api/v3/klines', {
            params: {
              symbol: `${ticker}USDT`,
              interval: binanceInterval,
              limit: 1000
            },
            timeout: 5000
          });

          if (!binanceRes.data || !Array.isArray(binanceRes.data) || binanceRes.data.length === 0) {
            return null;
          }

          // Binance returns OLDEST first.
          let klines = binanceRes.data;
          
          // Current candle data (Binance newest is last)
          const latestCandle = klines[klines.length - 1];
          const open = parseFloat(latestCandle[1]);
          const close = parseFloat(latestCandle[4]);
          const priceChange = ((close - open) / open) * 100;

          // Array index 4 is close price string for Binance
          const closes = klines.map((k: any) => parseFloat(k[4]));
          const highs = klines.map((k: any) => parseFloat(k[2]));
          const lows = klines.map((k: any) => parseFloat(k[3]));
          
          const maxHigh = Math.max(...highs);
          const minLow = Math.min(...lows);
          const range = maxHigh - minLow;
          const currentPrice = closes[closes.length - 1];
          const fibLong = range > 0 ? ((maxHigh - currentPrice) / range) * 100 : 0;
          const fibShort = range > 0 ? ((currentPrice - minLow) / range) * 100 : 0;

          const rsi = calculateRSI(closes);
          const prevRsi = closes.length > 1 ? calculateRSI(closes.slice(0, -1)) : null;

          // Calculate Kairi using EMA 9
          let kairi = 0;
          let ema9 = 0;
          if (closes.length > 0) {
            const period = Math.min(9, closes.length);
            const k = 2 / (period + 1);
            let ema = closes[0]; 
            for (let i = 1; i < closes.length; i++) {
              ema = (closes[i] * k) + (ema * (1 - k));
            }
            ema9 = ema;
            const currentPrice = closes[closes.length - 1];
            kairi = ema9 > 0 ? ((currentPrice - ema9) / ema9) * 100 : 0;
          }

          const rsiHistory = calculateRSIHistory(closes);
          const stoch = calculateStochRSI(rsiHistory);

          const recentRsis = rsiHistory.slice(-20);
          const recentMaxRsi = recentRsis.length > 0 ? Math.max(...recentRsis) : null;
          const recentMinRsi = recentRsis.length > 0 ? Math.min(...recentRsis) : null;

          let emaCross: 'up' | 'down' | 'bullish' | 'bearish' | 'none' = 'none';
          if (closes.length >= 144) {
            const ema72 = calculateEMAs(closes, 72);
            const ema144 = calculateEMAs(closes, 144);
            const last72 = ema72[ema72.length - 1];
            const last144 = ema144[ema144.length - 1];
            const prev72 = ema72[ema72.length - 2];
            const prev144 = ema144[ema144.length - 2];

            if (prev72 <= prev144 && last72 > last144) {
              emaCross = 'up';
            } else if (prev72 >= prev144 && last72 < last144) {
              emaCross = 'down';
            } else if (last72 > last144) {
              emaCross = 'bullish';
            } else if (last72 < last144) {
              emaCross = 'bearish';
            }
          }

          if (rsi !== null) {
            return {
              id: coin.id,
              symbol: symbol,
              name: coin.name,
              ticker: ticker,
              rsi: parseFloat(rsi.toFixed(2)),
              prevRsi: prevRsi !== null ? parseFloat(prevRsi.toFixed(2)) : null,
              recentMaxRsi: recentMaxRsi !== null ? parseFloat(recentMaxRsi.toFixed(2)) : null,
              recentMinRsi: recentMinRsi !== null ? parseFloat(recentMinRsi.toFixed(2)) : null,
              stochK: stoch ? parseFloat(stoch.k.toFixed(2)) : null,
              stochD: stoch ? parseFloat(stoch.d.toFixed(2)) : null,
              kairi: parseFloat(kairi.toFixed(2)),
              fibLong: parseFloat(fibLong.toFixed(2)),
              fibShort: parseFloat(fibShort.toFixed(2)),
              emaCross,
              marketCap: coin.market_cap,
              price: coin.current_price,
              priceChange: parseFloat(priceChange.toFixed(2)),
              zone: getZone(rsi),
              rank: coin.rank,
              leverage: futuresLeverage?.get(ticker) || null
            };
          }
        } catch (error: any) {
          return null;
        }
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults.filter(r => r !== null && r !== undefined));
      
      // Delay between batches
      if (i + batchSize < coins.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    cache.set(cacheKey, results, 30);
    res.json(results);

  } catch (error: any) {
    console.error('API Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// New Endpoint for historical RSI
app.get('/api/crypto-history', async (req, res) => {
  const symbol = (req.query.symbol as string) || 'BTC';
  const years = parseFloat(req.query.years as string) || 2;
  const inTimeframe = (req.query.timeframe as string) || '1d';
  
  const binanceInterval = inTimeframe;
  
  const endAt = Math.floor(Date.now() / 1000);
  const startAt = endAt - Math.floor(years * 365.25 * 24 * 60 * 60);

  // Binance limits to 1000 per request. Calculate if we need pagination.
  let klines = [];
  try {
    let requests = [];
    const maxPerReq = 1000;
    let stepSecs = maxPerReq * 24 * 3600; // default for 1d
    
    if (inTimeframe === '15m') stepSecs = maxPerReq * 15 * 60;
    if (inTimeframe === '30m') stepSecs = maxPerReq * 30 * 60;
    if (inTimeframe === '1h') stepSecs = maxPerReq * 3600;
    if (inTimeframe === '4h') stepSecs = maxPerReq * 4 * 3600;
    if (inTimeframe === '1w') stepSecs = maxPerReq * 7 * 24 * 3600;

    let currStart = startAt;
    while (currStart < endAt) {
      let currEnd = currStart + stepSecs;
      if (currEnd > endAt) currEnd = endAt;
      
      requests.push(
        axios.get('https://data-api.binance.vision/api/v3/klines', {
          params: {
            symbol: `${symbol.toUpperCase()}USDT`,
            interval: binanceInterval,
            startTime: currStart * 1000,
            endTime: currEnd * 1000,
            limit: 1000
          },
          timeout: 10000
        })
      );
      currStart = currEnd + 1;
    }

    const responses = await Promise.all(requests);
    
    // Combine all and filter out empty data
    for (const r of responses) {
      if (r.data && Array.isArray(r.data)) {
        klines.push(...r.data);
      }
    }
      
    if (klines.length === 0) {
      return res.status(404).json({ error: 'No data' });
    }
    
    klines.sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    
    // Dedup just in case over boundaries
    const uniqueKlines: any[] = [];
    const seen = new Set();
    for (const k of klines) {
      if (!seen.has(k[0])) {
        seen.add(k[0]);
        // Convert Binance format to KuCoin format so existing logic doesn't break
        // KuCoin format: 0: time (sec string), 1: open, 2: close, 3: high, 4: low, 5: volume, 6: turnover
        // Binance format: 0: openTime, 1: open, 2: high, 3: low, 4: close, 5: volume, 7: quote volume
        uniqueKlines.push([
          (k[0] / 1000).toString(),
          k[1],
          k[4],
          k[2],
          k[3],
          k[5],
          k[7]
        ]);
      }
    }

    const period = 14;
    if (uniqueKlines.length <= period) return res.json({ symbol, history: [] });
    
    let gains = 0;
    let losses = 0;
    let history = [];

    // Array index 2 is close, index 0 is timestamp
    for (let i = 1; i <= period; i++) {
        let change = parseFloat(uniqueKlines[i][2]) - parseFloat(uniqueKlines[i-1][2]);
        if (change > 0) gains += change;
        else losses -= change;
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    let rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
    let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    
    history.push({
        date: parseInt(uniqueKlines[period][0]) * 1000,
        price: parseFloat(uniqueKlines[period][2]),
        rsi: parseFloat(rsi.toFixed(2))
    });

    for (let i = period + 1; i < uniqueKlines.length; i++) {
        let change = parseFloat(uniqueKlines[i][2]) - parseFloat(uniqueKlines[i-1][2]);
        let gain = change > 0 ? change : 0;
        let loss = change < 0 ? -change : 0;
        
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        
        rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
        rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
        
        history.push({
            date: parseInt(uniqueKlines[i][0]) * 1000,
            price: parseFloat(uniqueKlines[i][2]),
            rsi: parseFloat(rsi.toFixed(2))
        });
    }
    
    return res.json({ symbol, history });
  } catch(e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Helper for Binance signatures
function signBinanceRequest(queryString: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

// Endpoint to provide signature and API key for client-side direct calls (to bypass US IP block)
app.get('/api/binance-auth', (req, res) => {
  const qs = req.query.qs as string;
  if (!qs) return res.status(400).json({ error: 'Missing qs parameter' });

  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;

  if (!apiKey || !apiSecret) {
    return res.status(401).json({ error: 'BINANCE_API_KEY and BINANCE_API_SECRET are not configured in environment variables.' });
  }

  const signature = signBinanceRequest(qs, apiSecret);
  res.json({ apiKey, signature });
});

// Binance Futures PnL Endpoint
app.get('/api/binance-pnl', async (req, res) => {
  let startTime = 0;
  let endTime = Date.now();

  try {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(401).json({ error: 'BINANCE_API_KEY and BINANCE_API_SECRET are not configured in environment variables.' });
    }

    startTime = parseInt(req.query.startTime as string);
    endTime = parseInt(req.query.endTime as string) || Date.now();
    
    if (!startTime) {
      return res.status(400).json({ error: 'startTime is required' });
    }

    const maxWaitFrames = 3;
    let allIncome: any[] = [];
    let seenIncomeIds = new Set();
    let currentStartTime = startTime;
    
    for (let i = 0; i < maxWaitFrames; i++) {
       let chunkEndTime = Math.min(currentStartTime + 29 * 24 * 60 * 60 * 1000, endTime);
       const qs = `startTime=${currentStartTime}&endTime=${chunkEndTime}&limit=1000&timestamp=${Date.now()}`;
       const signature = signBinanceRequest(qs, apiSecret);
       
       const response = await axios.get(`https://fapi.binance.com/fapi/v1/income?${qs}&signature=${signature}`, {
         headers: {
           'X-MBX-APIKEY': apiKey
         },
         timeout: 10000
       });
       
       const data = response.data;
       if (!Array.isArray(data) || data.length === 0) {
         if (chunkEndTime >= endTime) break;
         currentStartTime = chunkEndTime + 1;
         continue;
       }
       for (const t of data) {
         if (!seenIncomeIds.has(t.tranId)) {
           seenIncomeIds.add(t.tranId);
           allIncome.push(t);
         }
       }
       
       if (data.length < 1000) {
         if (chunkEndTime >= endTime) break;
         currentStartTime = chunkEndTime + 1;
       } else {
         currentStartTime = data[data.length - 1].time;
       }
    }

    res.json({ items: allIncome });
  } catch (error: any) {
    if (error.response?.data?.msg?.includes('restricted location') || error.response?.status === 451) {
      console.warn("Binance API blocked US IP. Returning mock data for preview purposes.");
      
      const mockItems = [];
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AAVEUSDT', 'ADAUSDT', 'AEROUSDT', 'AGTUSDT', 'ARBUSDT'];
      
      // Calculate a deterministic seed based on rough time window (e.g. rounded to nearest day for 'Hoje'/'24h'/etc)
      // and scaled by the time duration
      const durationHours = Math.max(1, (endTime - startTime) / (1000 * 60 * 60));
      const scaleMultiplier = Math.min(30, durationHours / 24); // scale up to 30x for a month
      
      for (let i = 0; i < symbols.length; i++) {
        const s = symbols[i];
        
        // Deterministic pseudo-random values based on symbol index
        const basePnl = ((i * 37) % 250) - 50; 
        const baseComm = -(((i * 13) % 40) / 10);
        const baseFunding = (((i * 7) % 20) / 10) - 1;
        
        mockItems.push({ symbol: s, incomeType: 'REALIZED_PNL', income: (basePnl * scaleMultiplier).toFixed(4), time: Date.now() });
        mockItems.push({ symbol: s, incomeType: 'COMMISSION', income: (baseComm * scaleMultiplier).toFixed(4), time: Date.now() });
        mockItems.push({ symbol: s, incomeType: 'FUNDING_FEE', income: (baseFunding * scaleMultiplier).toFixed(4), time: Date.now() });
      }
      
      res.json({ 
        items: mockItems, 
        isMock: true, 
        warning: "A API da Binance está restrita nesta região. Mostrando dados demonstrativos baseados no período escolhido."
      });
      return;
    }

    console.error("Binance API error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.msg || 'Failed to fetch Binance data' });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;

if (process.env.VERCEL !== '1') {
  startServer();
}
