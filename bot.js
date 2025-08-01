// Updated bot.js with real-time Binance API, full indicator calculation, and real-time support/resistance & Fear & Greed Index
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const technicalIndicators = require('technicalindicators');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const SYMBOL_MAP = {
  eth: 'ETHUSDT',
  btc: 'BTCUSDT',
  link: 'LINKUSDT',
  trx: 'TRXUSDT',
  bnb: 'BNBUSDT'
};

const TIMEFRAMES = {
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '6h': '6h',
  '12h': '12h',
  '24h': '1d'
};

const getCandles = async (symbol, interval, limit = 100) => {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await axios.get(url);
  return response.data.map(c => ({
    time: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5])
  }));
};

const calculateIndicators = (candles) => {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  const sma = technicalIndicators.SMA.calculate({ period: 14, values: closes });
  const ema = technicalIndicators.EMA.calculate({ period: 14, values: closes });
  const rsi = technicalIndicators.RSI.calculate({ period: 14, values: closes });
  const macd = technicalIndicators.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  const stochastic = technicalIndicators.Stochastic.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: 14,
    signalPeriod: 3
  });
  const adx = technicalIndicators.ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });

  return { sma, ema, rsi, macd, stochastic, adx };
};

const detectTrend = (candles) => {
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  const change = ((last - first) / first) * 100;
  const direction = change > 0 ? 'Bullish 🟢' : 'Bearish 🔴';
  return { direction, change: change.toFixed(2) + '%' };
};

const calculateAccuracy = (candles) => {
  let correct = 0;
  for (let i = 2; i < candles.length; i++) {
    const pred = candles[i - 1].close > candles[i - 2].close ? 'up' : 'down';
    const actual = candles[i].close > candles[i - 1].close ? 'up' : 'down';
    if (pred === actual) correct++;
  }
  return ((correct / (candles.length - 2)) * 100).toFixed(2);
};

const calculateSupportResistance = (candles) => {
  const recent = candles.slice(-10);
  const lows = recent.map(c => c.low);
  const highs = recent.map(c => c.high);
  const support = Math.min(...lows);
  const resistance = Math.max(...highs);
  return { support: support.toFixed(2), resistance: resistance.toFixed(2) };
};

const getFearGreedIndex = async () => {
  try {
    const response = await axios.get('https://api.alternative.me/fng/?limit=1');
    const value = response.data.data[0];
    return `${value.value} (${value.value_classification})`;
  } catch (err) {
    return 'Unavailable';
  }
};

bot.onText(/\/(eth|btc|link|trx|bnb)(15m|30m|1h|4h|6h|12h|24h)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const symbolKey = match[1].toLowerCase();
  const timeframeKey = match[2];
  const symbol = SYMBOL_MAP[symbolKey];
  const interval = TIMEFRAMES[timeframeKey];

  try {
    const candles = await getCandles(symbol, interval);
    const indicators = calculateIndicators(candles);
    const trend = detectTrend(candles);
    const accuracy = calculateAccuracy(candles);
    const sr = calculateSupportResistance(candles);
    const fearGreed = await getFearGreedIndex();

    const lastPrice = candles[candles.length - 1].close;

    const message = `📊 Trend Confirmation (${timeframeKey})

💰 Price: ${lastPrice}
🔥 Overall Trend: ${trend.direction} (${trend.change})
📉 Next Support: ${sr.support}
📈 Next Resistance: ${sr.resistance}
😨 Fear & Greed Index: ${fearGreed}
🎯 TP1: (pending logic)
🎯 TP2: (pending logic)
🛑 SL: (pending logic)
📈 Signal Accuracy: ${accuracy}%
📆 Date & Time: ${new Date().toLocaleString()}
🤖 Bot by Mr Ronaldo`;

    bot.sendMessage(chatId, message);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, 'Error fetching data or calculating indicators.');
  }
});
