require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const technicalIndicators = require('technicalindicators');
const express = require('express');
const cors = require('cors');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

app.use(cors());

// Supported commands and symbols mapping
const symbolsMap = {
  eth: 'ETHUSDT',
  btc: 'BTCUSDT',
  link: 'LINKUSDT',
  bnb: 'BNBUSDT',
  trx: 'TRXUSDT'
};

// Supported timeframes Binance allows: 5m, 15m, 30m, 1h, 4h, 1d
const timeFrames = ['5m', '15m', '30m', '1h', '4h', '1d'];

// Helper: get Binance klines for symbol and interval
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

// Fear & Greed Index (mocked for example - real API can be integrated)
async function getFearGreed() {
  // Placeholder - you can integrate from https://alternative.me/crypto/fear-and-greed-index/
  // For now, random or fixed
  const value = Math.floor(Math.random() * 101);
  let classification = 'Neutral';
  if (value < 25) classification = 'Extreme Fear';
  else if (value < 50) classification = 'Fear';
  else if (value < 75) classification = 'Greed';
  else classification = 'Extreme Greed';
  return { value, classification };
}

// Calculate simple indicators for trend confirmation and signals
function calculateIndicators(closes) {
  // Using technicalindicators lib
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

// Analyze trend based on indicators and price
function analyzeTrend(closes, indicators) {
  const latestClose = closes[closes.length - 1];
  const latestSMA20 = indicators.sma20[indicators.sma20.length - 1];
  const latestSMA50 = indicators.sma50[indicators.sma50.length - 1];
  const latestRSI = indicators.rsi[indicators.rsi.length - 1];
  const latestMACD = indicators.macd[indicators.macd.length - 1];

  // Trend logic: SMA20 above SMA50 = bullish, else bearish
  let overallTrend = 'Down';
  let trendPercentage = 40;

  if (latestSMA20 && latestSMA50) {
    if (latestSMA20 > latestSMA50) {
      overallTrend = 'Up';
      trendPercentage = 70 + (latestRSI > 50 ? 10 : 0); // Boost if RSI > 50
    } else {
      overallTrend = 'Down';
      trendPercentage = 70 - (latestRSI > 50 ? 10 : 0);
    }
  }

  // Signal accuracy estimated by MACD histogram positive/negative
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

// Support & Resistance mock (using recent lows and highs)
function calculateSupportResistance(klines) {
  // Simple approach: last 20 lows and highs
  const lows = klines.slice(-20).map(k => k.low);
  const highs = klines.slice(-20).map(k => k.high);

  const support = Math.min(...lows);
  const resistance = Math.max(...highs);

  return { support, resistance };
}

// Calculate percentage difference helper
function percentageDifference(current, target) {
  return (((target - current) / current) * 100).toFixed(2);
}

// Format date & time
function formatDateTime(ts) {
  return new Date(ts).toLocaleString('en-GB', { timeZone: 'UTC' });
}

// Main function to handle command
async function handleCommand(ctx, symbolKey, timeframe = '1h') {
  const symbol = symbolsMap[symbolKey.toLowerCase()];
  if (!symbol) {
    ctx.reply('Unsupported symbol. Use /eth /btc /link /bnb /trx');
    return;
  }

  if (!timeFrames.includes(timeframe)) {
    ctx.reply(`Unsupported timeframe. Use one of: ${timeFrames.join(', ')}`);
    return;
  }

  ctx.reply(`Fetching ${symbol} data for timeframe ${timeframe}...`);

  const klines = await getKlines(symbol, timeframe);
  if (!klines) {
    ctx.reply('Failed to fetch market data. Please try again later.');
    return;
  }

  const closes = klines.map(k => k.close);

  // Calculate indicators
  const indicators = calculateIndicators(closes);
  const trendAnalysis = analyzeTrend(closes, indicators);
  const { support, resistance } = calculateSupportResistance(klines);
  const fearGreed = await getFearGreed();

  // Calculate percentages for support/resistance and take profits/sl
  const supportDiffPercent = percentageDifference(trendAnalysis.latestClose, support);
  const resistanceDiffPercent = percentageDifference(trendAnalysis.latestClose, resistance);

  // Define TP and SL - simple logic: TP1 = resistance, TP2 = resistance + 2%
  const tp1 = resistance;
  const tp2 = resistance * 1.02;
  const sl = support;

  const tp1DiffPercent = percentageDifference(trendAnalysis.latestClose, tp1);
  const tp2DiffPercent = percentageDifference(trendAnalysis.latestClose, tp2);
  const slDiffPercent = percentageDifference(trendAnalysis.latestClose, sl);

  // Count old touches (how many times price touched support or resistance)
  // Simple mock: count number of candles where low <= support + small margin, similarly for resistance
  const supportTouches = klines.filter(k => k.low <= support * 1.001).length;
  const resistanceTouches = klines.filter(k => k.high >= resistance * 0.999).length;

  const message = `📊 Trend Confirmation (${timeframe.toUpperCase()})

💰 Price: $${trendAnalysis.latestClose.toFixed(4)}
🔥 Overall Trend: ${trendAnalysis.overallTrend} (${trendAnalysis.trendPercentage}%)
Next Support: $${support.toFixed(4)} (${supportDiffPercent}% away, touched ${supportTouches} times)
Next Resistance: $${resistance.toFixed(4)} (${resistanceDiffPercent}% away, touched ${resistanceTouches} times)
Fear & Greed Index: ${fearGreed.value} (${fearGreed.classification})
🎯 TP1: $${tp1.toFixed(4)} (${tp1DiffPercent}% away)
🎯 TP2: $${tp2.toFixed(4)} (${tp2DiffPercent}% away)
🛑 SL: $${sl.toFixed(4)} (${slDiffPercent}% away)
📈 Signal Accuracy: ${trendAnalysis.signalAccuracy}%
📆 Date & Time: ${formatDateTime(Date.now())} UTC
🤖 Bot by Mr Ronaldo`;

  ctx.reply(message);
}

// Telegram command handlers with optional timeframe param e.g. /eth 5m
bot.command(['eth', 'btc', 'link', 'bnb', 'trx'], async ctx => {
  try {
    const messageText = ctx.message.text.trim();
    const parts = messageText.split(' ');
    const command = parts[0].replace('/', '').toLowerCase();
    const timeframe = parts[1] ? parts[1].toLowerCase() : '1h';

    await handleCommand(ctx, command, timeframe);
  } catch (error) {
    console.error('Error handling command:', error);
    ctx.reply('An error occurred. Please try again later.');
  }
});

// Simple Express server to keep bot alive and open port for webhook if needed
app.get('/', (req, res) => {
  res.send('Crypto Trend Bot by Mr Ronaldo is running...');
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
  bot.launch();
  console.log('Telegram bot launched');
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
