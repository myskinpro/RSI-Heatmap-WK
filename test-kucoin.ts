import axios from 'axios';
async function t() {
  const symbols = ['BTC', 'ETH', 'XRP', 'ADA', 'SOL', 'MATIC', 'DOT', 'TRX', 'AVAX', 'LINK', 'UNI', 'ATOM', 'LTC', 'ETC', 'XLM', 'ALGO', 'VET', 'ICP', 'FIL', 'AAVE'];
  const promises = symbols.map(s => axios.get(`https://api.kucoin.com/api/v1/market/candles?type=1hour&symbol=${s}-USDT`));
  try {
    const results = await Promise.all(promises);
    console.log('success', results.filter(x => x.data.data).length);
  } catch (e: any) {
    console.error('error', e.message);
  }
}
t();
