import axios from "axios";
async function test() {
  const r = await axios.get('https://api.kucoin.com/api/v1/market/candles', {params: {symbol: 'BTC-USDT', type: '1hour'}});
  console.log(r.data.data.length);
}
test();
