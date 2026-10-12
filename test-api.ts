import axios from 'axios';

async function test() {
  try {
    const binanceRes = await axios.get('https://api.binance.us/api/v3/ticker/24hr');
    const usdtPairs = binanceRes.data.filter((t: any) => t.symbol.endsWith('USDT'));
    usdtPairs.sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
    
    console.log("Binance US USDT Pairs:", usdtPairs.length);
    console.log("Top 5 by volume:", usdtPairs.slice(0, 5).map((t: any) => t.symbol));
  } catch (e: any) {
    console.error("Binance US Error:", e.message);
  }
}
test();