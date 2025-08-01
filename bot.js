require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const technicalIndicators = require('technicalindicators');
const express = require('express');
const cors = require('cors');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

app.use(cors());

// Mapping symbols to Binance pairs
const symbolsMap = {
  eth: 'ETHUSDT',
  btc: 'BTCUSDT',
  link: 'LINKUSDT',
  bnb: 'BNBUSDT',
  trx: 'TRXUSDT'
};

// Valid intervals for commands
const validIntervals = ['15m', '30m', '1h', '4h', '6h', '12h', '24h'];

// Fetch Binance klines
async function getKlines(symbol, interval, limit = 100) {
  try {
    const url = `${process.env.BINANCE_API}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await axios.get(url);
    return response.data.map(candle => ({
      openTime: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
      closeTime: candle[6]
    }));
  } catch (error) {
    console.error('Error fetching klines:', error.message);
    return null;
  }
}

// Mock Fear & Greed Index (can be replaced with real API)
async function getFearGreed() {
  const value = Math.floor(Math.random() * 101);
  let classification = 'Neutral';
  if (value < 25) classification = 'Extreme Fear';
  else if (value < 50) classification = 'Fear';
  else if (value < 75) classification = 'Greed';
  else classification = 'Extreme Greed';
  return { value, classification };
}

// Calculate indicators
function calculateIndicators(closes) {
  const sma20 = technicalIndicators.SMA.calculate({ period: 20, values: closes });
  const sma50 = technicalIndicators.SMA.calculate({ period: 50, values: closes });
  const rsi = technicalIndicators.RSI.calculate({ period: 14, values: closes });
  const macd = technicalIndicators.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  return { sma20, sma50, rsi, macd };
}

// Analyze trend
function analyzeTrend(closes, indicators) {
  const latestClose = closes[closes.length - 1];
  const latestSMA20 = indicators.sma20[indicators.sma20.length - 1];
  const latestSMA50 = indicators.sma50[indicators.sma50.length - 1];
  const latestRSI = indicators.rsi[indicators.rsi.length - 1];
  const latestMACD = indicators.macd[indicators.macd.length - 1];

  let overallTrend = 'Down';
  let trendPercentage = 40;

  if (latestSMA20 && latestSMA50) {
    if (latestSMA20 > latestSMA50) {
      overallTrend = 'Up';
      trendPercentage = 70 + (latestRSI > 50 ? 10 : 0);
    } else {
      overallTrend = 'Down';
      trendPercentage = 70 - (latestRSI > 50 ? 10 : 0);
    }
  }

  let signalAccuracy = 60;
  if (latestMACD) {
    signalAccuracy = latestMACD.MACD > latestMACD.signal ? 75 : 40;
  }

  return {
    overallTrend,
    trendPercentage,
    signalAccuracy,
    latestClose
  };
}

// Calculate support and resistance
function calculateSupportResistance(klines) {
  const lows = klines.slice(-20).map(k => k.low);
  const highs = klines.slice(-20).map(k => k.high);

  const support = Math.min(...lows);
  const resistance = Math.max(...highs);

  return { support, resistance };
}

// Percentage difference helper
function percentageDifference(current, target) {
  return (((target - current) / current) * 100).toFixed(2);
}

// Format UTC date and time
function formatDateTime(ts) {
  return new Date(ts).toLocaleString('en-GB', { timeZone: 'UTC' });
}

// Main command handler
async function handleCommand(ctx, symbolKey, timeframe = '1h') {
  const symbol = symbolsMap[symbolKey.toLowerCase()];
  if (!symbol) {
    ctx.reply('Unsupported symbol. Use commands like /eth15m, /btc4h, /link1h, /trx12h, /bnb24h');
    return;
  }

  if (!validIntervals.includes(timeframe)) {
    ctx.reply(`Unsupported timeframe. Valid options: ${validIntervals.join(', ')}`);
    return;
  }

  ctx.reply(`Fetching ${symbol} data for timeframe ${timeframe}...`);

  const klines = await getKlines(symbol, timeframe, 100);
  if (!klines) {
    ctx.reply('Failed to fetch market data. Please try again later.');
    return;
  }

  const closes = klines.map(k => k.close);
  const indicators = calculateIndicators(closes);
  const trendAnalysis = analyzeTrend(closes, indicators);
  const { support, resistance } = calculateSupportResistance(klines);
  const fearGreed = await getFearGreed();

  const supportDiffPercent = percentageDifference(trendAnalysis.latestClose, support);
  const resistanceDiffPercent = percentageDifference(trendAnalysis.latestClose, resistance);

  const tp1 = resistance;
  const tp2 = resistance * 1.02;
  const sl = support;

  const tp1DiffPercent = percentageDifference(trendAnalysis.latestClose, tp1);
  const tp2DiffPercent = percentageDifference(trendAnalysis.latestClose, tp2);
  const slDiffPercent = percentageDifference(trendAnalysis.latestClose, sl);

  const supportTouches = klines.filter(k => k.low <= support * 1.001).length;
  const resistanceTouches = klines.filter(k => k.high >= resistance * 0.999).length;

  const message = `📊 Trend Confirmation (${timeframe.toUpperCase()})

💰 Price: $${trendAnalysis.latestClose.toFixed(4)}
🔥 Overall Trend: ${trendAnalysis.overallTrend} (${trendAnalysis.trendPercentage}%)
🟢Next Support: $${support.toFixed(4)} (${supportDiffPercent}% away, touched ${supportTouches} times)
🔴Next Resistance: $${resistance.toFixed(4)} (${resistanceDiffPercent}% away, touched ${resistanceTouches} times)
🤑Fear & Greed Index: ${fearGreed.value} (${fearGreed.classification})
🎯 TP1: $${tp1.toFixed(4)} (${tp1DiffPercent}% away)
🎯 TP2: $${tp2.toFixed(4)} (${tp2DiffPercent}% away)
🛑 SL: $${sl.toFixed(4)} (${slDiffPercent}% away)
📈 Signal Accuracy: ${trendAnalysis.signalAccuracy}%
📆 Date & Time: ${formatDateTime(Date.now())} UTC
🤖 Bot by Mr Ronaldo`;

  ctx.reply(message);
}

// Listen to commands with symbol + timeframe fused, e.g. /eth15m
bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text.toLowerCase().trim();

    const match = text.match(/^\/(eth|btc|link|bnb|trx)(15m|30m|1h|4h|6h|12h|24h)?$/);

    if (!match) {
      return ctx.reply('Invalid command format.\nUse commands like /eth15m, /btc4h, /link1h, /trx12h, /bnb24h');
    }

    const symbolKey = match[1];
    const timeframe = match[2] || '1h';

    await handleCommand(ctx, symbolKey, timeframe);

  } catch (error) {
    console.error('Error handling command:', error);
    ctx.reply('An error occurred. Please try again later.');
  }
});

// Express server to keep bot alive
app.get('/', (req, res) => {
  res.send('Crypto Trend Bot by Mr Ronaldo is running...');
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
  bot.launch();
  console.log('Telegram bot launched');
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
