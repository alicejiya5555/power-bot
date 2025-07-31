require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

const trackedWallets = [
  { name: "Binance 14", address: "0x28C6c06298d514Db089934071355E5743bf21d60" },
  { name: "Chainlink-2", address: "0xDC530D9457755926550b59e8ECcdaE7624181557" },
  { name: "Jump Trading", address: "0x7ef2e0048f5bAeDe046f6BF797943daF4ED8CB47" },
  { name: "Wintermute", address: "0x4f5f4CcD827b79848B0d88cD52d6464Eec720D8D" },
  { name: "Vitalik.eth", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" }
];

// Global trading state
let symbol = 'ETHUSDT';
let timeframe = '1h';

const VALID_SYMBOLS = ['ETHUSDT', 'BTCUSDT', 'LINKUSDT'];
const VALID_TIMEFRAMES = ['15m', '30m', '1h', '4h', '12h'];

let lastTxHashes = new Set();

// --- Helper functions ---

function formatValue(value, decimals) {
  return (Number(value) / Math.pow(10, decimals)).toFixed(4);
}

// 1. Whale Activity & Smart Money Tracker

async function fetchRecentTxs(walletAddress) {
  try {
    const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${walletAddress}&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    const response = await axios.get(url);
    if (response.data.status === '1') return response.data.result;
    else return [];
  } catch {
    return [];
  }
}

async function checkWallets() {
  let alerts = [];
  for (const wallet of trackedWallets) {
    const transactions = await fetchRecentTxs(wallet.address);
    for (const tx of transactions) {
      if (lastTxHashes.has(tx.hash)) continue;
      lastTxHashes.add(tx.hash);

      const direction = tx.to.toLowerCase() === wallet.address.toLowerCase() ? '🟢 Deposit' : '🔴 Withdrawal';
      const valueFormatted = formatValue(tx.value, tx.tokenDecimal);

      const message = `
🐋 *Whale Alert!*

👤 Wallet: ${wallet.name}
💠 Token: ${tx.tokenSymbol}
💰 Amount: ${valueFormatted}
➡️ Direction: ${direction}
🔗 [View Transaction](https://etherscan.io/tx/${tx.hash})
      `;
      alerts.push(message);
    }
  }
  return alerts;
}

// 2. Trend Confirmation & Multi-Timeframe Heatmap

async function fetchKlines(symbol, interval, limit = 50) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await axios.get(url);
    return res.data;
  } catch {
    return [];
  }
}

function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  let emaArray = [];
  let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
  emaArray[period - 1] = ema;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaArray[i] = ema;
  }
  return emaArray;
}

function determineTrend(emaShort, emaLong) {
  if (!emaShort.length || !emaLong.length) return 'neutral';
  const lastShort = emaShort[emaShort.length - 1];
  const lastLong = emaLong[emaLong.length - 1];
  if (lastShort > lastLong) return 'bullish';
  else if (lastShort < lastLong) return 'bearish';
  return 'neutral';
}

async function analyzeSingleTrend(symbol, interval) {
  const klines = await fetchKlines(symbol, interval);
  if (!klines.length) return 'unknown';

  const closes = klines.map(k => parseFloat(k[4]));
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  return determineTrend(ema12, ema26);
}

async function analyzeTrendMulti(symbol, baseInterval) {
  const intervalsOrder = ['15m', '30m', '1h', '4h', '12h'];
  const baseIndex = intervalsOrder.indexOf(baseInterval);
  if (baseIndex === -1) return [];

  const intervalsToCheck = intervalsOrder.slice(baseIndex);

  let results = [];
  for (const interval of intervalsToCheck) {
    const trend = await analyzeSingleTrend(symbol, interval);
    results.push({ interval, trend });
  }
  return results;
}

function formatTrendResults(trends) {
  let bullishCount = trends.filter(t => t.trend === 'bullish').length;
  let bearishCount = trends.filter(t => t.trend === 'bearish').length;

  let overallTrend = 'Sideways/Neutral';

  if (bullishCount === trends.length) overallTrend = 'Strong Bullish 📈';
  else if (bearishCount === trends.length) overallTrend = 'Strong Bearish 📉';
  else if (bullishCount > bearishCount) overallTrend = 'Bullish 🟢';
  else if (bearishCount > bullishCount) overallTrend = 'Bearish 🔴';

  let msg = `📊 *Trend Confirmation & Multi-Timeframe Heatmap*\n\n`;
  trends.forEach(t => {
    const icon = t.trend === 'bullish' ? '🟢' : t.trend === 'bearish' ? '🔴' : '🟡';
    msg += `${icon} ${t.interval.toUpperCase()}: ${t.trend}\n`;
  });

  msg += `\n🔥 *Overall Trend:* ${overallTrend}`;
  return msg;
}

// 3. Liquidity Zones & Order Blocks

async function fetchCandles(symbol, interval, limit = 100) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await axios.get(url);
    return response.data;
  } catch {
    return [];
  }
}

function detectLiquidityZones(candles) {
  const lows = candles.map(c => parseFloat(c[3]));
  const highs = candles.map(c => parseFloat(c[2]));

  const zones = [];

  for (let i = 0; i < lows.length; i++) {
    let count = 1;
    let sum = lows[i];
    for (let j = i + 1; j < lows.length; j++) {
      if (Math.abs(lows[j] - lows[i]) / lows[i] < 0.005) {
        count++;
        sum += lows[j];
      }
    }
    if (count >= 3) {
      zones.push({ type: 'Support', price: (sum / count).toFixed(4), touches: count });
    }
  }

  for (let i = 0; i < highs.length; i++) {
    let count = 1;
    let sum = highs[i];
    for (let j = i + 1; j < highs.length; j++) {
      if (Math.abs(highs[j] - highs[i]) / highs[i] < 0.005) {
        count++;
        sum += highs[j];
      }
    }
    if (count >= 3) {
      zones.push({ type: 'Resistance', price: (sum / count).toFixed(4), touches: count });
    }
  }

  const uniqueZones = [];
  zones.forEach(z => {
    if (!uniqueZones.find(uz => Math.abs(uz.price - z.price) / z.price < 0.001 && uz.type === z.type)) {
      uniqueZones.push(z);
    }
  });

  return uniqueZones;
}

function formatLiquidityZones(zones) {
  if (zones.length === 0) return 'No clear liquidity zones detected.';
  let msg = `💧 *Liquidity Zones & Order Blocks Detected*\n\n`;
  zones.forEach(z => {
    const icon = z.type === 'Support' ? '🟢' : '🔴';
    msg += `${icon} ${z.type} Zone at $${z.price} (Touches: ${z.touches})\n`;
  });
  return msg;
}

// 4. TP/SL Optimization

function calculateTP_SL(candles) {
  if (candles.length === 0) return null;

  const highs = candles.map(c => parseFloat(c[2]));
  const lows = candles.map(c => parseFloat(c[3]));

  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);

  const lastClose = parseFloat(candles[candles.length -1][4]);

  const tp1 = lastClose + (maxHigh - lastClose) * 0.5;
  const tp2 = lastClose + (maxHigh - lastClose) * 0.8;
  const sl = minLow - (lastClose - minLow) * 0.3;

  return { tp1: tp1.toFixed(4), tp2: tp2.toFixed(4), sl: sl.toFixed(4) };
}

// --- Command Parsing and Bot Logic ---

bot.start((ctx) => {
  ctx.reply(`Welcome, noble trader.  
Set symbol and timeframe with commands like:
/eth15m /btc1h /link4h

Then use:
/whale - Check whale activity
/trend - Get trend confirmation heatmap
/liquidity - Detect liquidity zones & order blocks
/tpsl - Calculate Take Profit and Stop Loss levels

Happy trading! 🌟`);
});

// Parse concise symbol/timeframe commands
bot.on('text', async (ctx) => {
  const text = ctx.message.text.toLowerCase();

  // Handle symbol/timeframe set commands e.g. /btc1h
  const match = text.match(/^\/(eth|btc|link)(15m|30m|1h|4h|12h)$/);
  if (match) {
    const symMap = { eth: 'ETHUSDT', btc: 'BTCUSDT', link: 'LINKUSDT' };
    symbol = symMap[match[1]];
    timeframe = match[2];
    return ctx.reply(`Symbol set to *${symbol}* and timeframe set to *${timeframe}*`, { parse_mode: 'Markdown' });
  }

  // Whale check
  if (text === '/whale') {
    await ctx.reply('🐋 Checking whale wallets for new transactions...');
    const alerts = await checkWallets();
    if (alerts.length === 0) return ctx.reply('No new whale transactions found.');
    for (const alert of alerts) {
      await ctx.reply(alert, { parse_mode: 'Markdown' });
    }
    return;
  }

  // Trend confirmation
  if (text === '/trend') {
    await ctx.reply(`📊 Fetching trend data for *${symbol}* on *${timeframe}*, please wait...`, { parse_mode: 'Markdown' });
    const trends = await analyzeTrendMulti(symbol, timeframe);
    if (trends.length === 0) return ctx.reply('Could not fetch trend data.');
    const msg = formatTrendResults(trends);
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }

  // Liquidity zones
  if (text === '/liquidity') {
    await ctx.reply(`💧 Detecting liquidity zones for *${symbol}* on *${timeframe}*...`, { parse_mode: 'Markdown' });
    const candles = await fetchCandles(symbol, timeframe);
    const zones = detectLiquidityZones(candles);
    const msg = formatLiquidityZones(zones);
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }

  // TP/SL optimization
  if (text === '/tpsl') {
    await ctx.reply(`🎯 Calculating TP/SL for *${symbol}* on *${timeframe}*...`, { parse_mode: 'Markdown' });
    const candles = await fetchCandles(symbol, timeframe);
    const levels = calculateTP_SL(candles);
    if (!levels) return ctx.reply('Insufficient data to calculate TP/SL.');
    return ctx.reply(`🎯 TP/SL Levels for *${symbol}* on *${timeframe}*:
TP1: $${levels.tp1}
TP2: $${levels.tp2}
Stop Loss: $${levels.sl}`, { parse_mode: 'Markdown' });
  }

  // Unknown command fallback
  if (text.startsWith('/')) {
    return ctx.reply('Unknown command. Use /start for help.');
  }
});


// Auto-check whales every 5 minutes and send alerts
setInterval(async () => {
  const alerts = await checkWallets();
  if (alerts.length > 0) {
    for (const alert of alerts) {
      await bot.telegram.sendMessage(CHAT_ID, alert, { parse_mode: 'Markdown' });
    }
  }
}, 5 * 60 * 1000);

// Optional: Auto trend alert every 30 minutes (comment out if you want)
// setInterval(async () => {
//   const trends = await analyzeTrendMulti(symbol, timeframe);
//   if (trends.length > 0) {
//     const msg = formatTrendResults(trends);
//     await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
//   }
// }, 30 * 60 * 1000);

bot.launch();
console.log('🤖 Unified Trading Helper Bot is running...');
