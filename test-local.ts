import axios from 'axios';

async function test() {
  try {
    const res = await axios.get('http://localhost:3000/api/crypto-rsi', {
      params: { timeframe: '1h', limit: 100, minMarketCap: 1000000000 }
    });
    console.log("Response status:", res.status);
    console.log("Data length:", res.data.length);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}
test();
