require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const { 
  SMA, 
  EMA, 
  RSI, 
  MACD, 
  Stochastic,
  OBV
} = require('technicalindicators');

// Initialize Express server
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Crypto Analysis Bot is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { 
  polling: true,
  request: {
    timeout: 60000
  }
});

// Configuration
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

// Cache for API responses
const cache = new Map();
const CACHE_TTL = 30000;

// Enhanced candle data fetching
async function getCandles(symbol, interval, limit = 100) {
  const cacheKey = `${symbol}-${interval}`;
  
  if (cache.has(cacheKey)) {
    const { timestamp, data } = cache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      return data;
    }
  }

  try {
    console.log(`Fetching candles for ${symbol} ${interval}`);
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await axios.get(url, { timeout: 10000 });
    
    if (!response.data || !Array.isArray(response.data)) {
      throw new Error('Invalid response from Binance API');
    }

    const candles = response.data.map(c => ({
      time: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5])
    }));

    cache.set(cacheKey, { timestamp: Date.now(), data: candles });
    return candles;
  } catch (error) {
    console.error('Error fetching candles:', error.message);
    throw new Error(`Failed to fetch candle data: ${error.message}`);
  }
}

// Simplified and more reliable indicator calculations
function calculateIndicators(candles) {
  if (!candles || candles.length < 50) {
    throw new Error('Need at least 50 candles for analysis');
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  // Only keep reliable indicators
  const indicators = {
    sma: safeCalculate(() => SMA.calculate({ period: 14, values: closes })),
    ema: safeCalculate(() => EMA.calculate({ period: 14, values: closes })),
    rsi: safeCalculate(() => RSI.calculate({ period: 14, values: closes })),
    macd: safeCalculate(() => {
      const result = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9
      });
      const last = result[result.length - 1];
      return last ? `${last.MACD.toFixed(2)}/${last.signal.toFixed(2)}` : null;
    }),
    stochastic: safeCalculate(() => {
      const result = Stochastic.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3
      });
      const last = result[result.length - 1];
      return last ? `${last.k.toFixed(2)}/${last.d.toFixed(2)}` : null;
    }),
    obv: safeCalculate(() => OBV.calculate({ close: closes, volume: volumes }))
  };

  return indicators;
}

// Helper function for safe indicator calculation
function safeCalculate(fn) {
  try {
    const result = fn();
    if (Array.isArray(result)) {
      const lastValue = result[result.length - 1];
      return lastValue !== undefined ? lastValue.toFixed(2) : 'N/A';
    }
    return result || 'N/A';
  } catch (error) {
    console.error('Indicator calculation error:', error.message);
    return 'N/A';
  }
}

// Trend detection
function detectTrend(candles) {
  if (!candles || candles.length < 2) {
    return { direction: 'Neutral', change: '0%' };
  }

  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  const change = ((last - first) / first) * 100;
  const direction = change > 0 ? 'Bullish 🟢' : change < 0 ? 'Bearish 🔴' : 'Neutral';
  return { direction, change: Math.abs(change).toFixed(2) + '%' };
}

// Support/resistance levels
function calculateSupportResistance(candles) {
  if (!candles || candles.length < 10) {
    return { support: 'N/A', resistance: 'N/A' };
  }

  const recent = candles.slice(-10);
  const support = Math.min(...recent.map(c => c.low));
  const resistance = Math.max(...recent.map(c => c.high));
  return {
    support: support.toFixed(4),
    resistance: resistance.toFixed(4)
  };
}

// Command handler
bot.onText(/\/(eth|btc|link|trx|bnb)(15m|30m|1h|4h|6h|12h|24h)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const symbolKey = match[1].toLowerCase();
  const timeframeKey = match[2];

  if (!TIMEFRAMES[timeframeKey]) {
    return bot.sendMessage(chatId, 'Invalid timeframe. Use: 15m, 30m, 1h, 4h, 6h, 12h, 24h');
  }

  const symbol = SYMBOL_MAP[symbolKey];
  const interval = TIMEFRAMES[timeframeKey];

  try {
    const processingMsg = await bot.sendMessage(chatId, `⏳ Analyzing ${symbolKey.toUpperCase()} ${timeframeKey}...`);

    const candles = await getCandles(symbol, interval);
    const indicators = calculateIndicators(candles);
    const trend = detectTrend(candles);
    const sr = calculateSupportResistance(candles);
    const lastPrice = candles[candles.length - 1].close.toFixed(4);

    // Generate simple TP/SL levels
    const tp1 = (lastPrice * 1.01).toFixed(4);
    const tp2 = (lastPrice * 1.02).toFixed(4);
    const sl = (lastPrice * 0.99).toFixed(4);

    const message = `📊 *${symbolKey.toUpperCase()} Analysis (${timeframeKey})*

💰 Price: ${lastPrice}
📈 Trend: ${trend.direction} (${trend.change})
📉 Support: ${sr.support}
📈 Resistance: ${sr.resistance}

📊 Indicators:
- RSI(14): ${indicators.rsi} ${indicators.rsi > 70 ? '🔴' : indicators.rsi < 30 ? '🟢' : ''}
- MACD: ${indicators.macd}
- Stochastic: ${indicators.stochastic}
- OBV: ${indicators.obv}

🎯 TP1: ${tp1}
🎯 TP2: ${tp2}
🛑 SL: ${sl}

⏰ ${new Date().toLocaleString()}
🤖 Bot by Mr Ronaldo`;

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: processingMsg.message_id,
      parse_mode: 'Markdown'
    });

  } catch (error) {
    console.error('Command error:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}\nPlease try again later.`);
  }
});

// Start command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `Welcome to Crypto Analysis Bot!\n\nUse commands like:\n/btc1h\n/eth4h\n/link24h`, 
    { parse_mode: 'Markdown' }
  );
});

console.log('Bot started successfully');
