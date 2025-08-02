require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const technicalIndicators = require('technicalindicators');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Keep the port open
app.get('/', (req, res) => {
  res.send('Mr Ronaldo\'s Crypto Bot is alive and watching the markets.');
});
app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

// Global error handlers for debugging
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Telegram Bot initialization
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

async function getCandles(symbol, interval, limit = 100) {
  try {
    console.log(`Fetching candles for ${symbol} at interval ${interval}...`);
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await axios.get(url);
    if (!Array.isArray(response.data) || response.data.length === 0) {
      throw new Error('Empty candle data received from Binance API');
    }
    console.log(`Fetched ${response.data.length} candles.`);
    return response.data.map(c => ({
      time: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5])
    }));
  } catch (error) {
    console.error('Error in getCandles:', error.message);
    throw error;
  }
}

function calculateIndicators(candles) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  return {
    sma: technicalIndicators.SMA.calculate({ period: 14, values: closes }),
    ema: technicalIndicators.EMA.calculate({ period: 14, values: closes }),
    rsi: technicalIndicators.RSI.calculate({ period: 14, values: closes }),
    macd: technicalIndicators.MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    }),
    stochastic: technicalIndicators.Stochastic.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
      signalPeriod: 3
    }),
    adx: technicalIndicators.ADX.calculate({ high: highs, low: lows, close: closes, period: 14 }),
    williamsR: technicalIndicators.WilliamsR.calculate({ high: highs, low: lows, close: closes, period: 14 }),
    obv: technicalIndicators.OBV.calculate({ close: closes, volume: volumes }),
    cci: technicalIndicators.CCI.calculate({ high: highs, low: lows, close: closes, period: 20 }),
    roc: technicalIndicators.ROC.calculate({ period: 12, values: closes }),
    momentum: technicalIndicators.MOM.calculate({ period: 10, values: closes }),
    ultosc: technicalIndicators.UltimateOscillator.calculate({ high: highs, low: lows, close: closes })
  };
}

function detectTrend(candles) {
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  const change = ((last - first) / first) * 100;
  const direction = change > 0 ? 'Bullish 🟢' : 'Bearish 🔴';
  return { direction, change: change.toFixed(2) + '%' };
}

function calculateAccuracy(candles) {
  let correct = 0;
  for (let i = 2; i < candles.length; i++) {
    const pred = candles[i - 1].close > candles[i - 2].close ? 'up' : 'down';
    const actual = candles[i].close > candles[i - 1].close ? 'up' : 'down';
    if (pred === actual) correct++;
  }
  return ((correct / (candles.length - 2)) * 100).toFixed(2);
}

function calculateSupportResistance(candles) {
  const recent = candles.slice(-10);
  const lows = recent.map(c => c.low);
  const highs = recent.map(c => c.high);
  const support = Math.min(...lows);
  const resistance = Math.max(...highs);
  return { support: support.toFixed(2), resistance: resistance.toFixed(2) };
}

async function getFearGreedIndex() {
  try {
    const response = await axios.get('https://api.alternative.me/fng/?limit=1');
    const value = response.data.data[0];
    return `${value.value} (${value.value_classification})`;
  } catch {
    return 'Unavailable';
  }
}

bot.onText(/\/(eth|btc|link|trx|bnb)(15m|30m|1h|4h|6h|12h|24h)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const symbolKey = match[1].toLowerCase();
  const timeframeKey = match[2];

  if (!Object.keys(TIMEFRAMES).includes(timeframeKey)) {
    bot.sendMessage(chatId, 'Invalid timeframe. Use one of: 15m, 30m, 1h, 4h, 6h, 12h, 24h.');
    return;
  }

  const symbol = SYMBOL_MAP[symbolKey];
  const interval = TIMEFRAMES[timeframeKey];

  try {
    const candles = await getCandles(symbol, interval);

    if (!candles || candles.length === 0) {
      bot.sendMessage(chatId, 'No candle data available for this symbol/timeframe.');
      return;
    }

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
    console.error('Error details:', err.response ? err.response.data : err.message || err);
    bot.sendMessage(chatId, 'Error fetching data or calculating indicators. Check logs for details.');
  }
});
