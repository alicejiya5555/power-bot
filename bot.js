require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const { 
  SMA, EMA, RSI, MACD, Stochastic, ADX, 
  WilliamsR, OBV, CCI, ROC, MOM, UltimateOscillator 
} = require('technicalindicators');

// Initialize Express server
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Mr Ronaldo\'s Crypto Bot is alive and watching the markets.');
});

app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

// Error handling
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
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

// Cache for storing recent requests
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

// Enhanced candle data fetching with retry logic
async function getCandles(symbol, interval, limit = 100, retries = 3) {
  const cacheKey = `${symbol}-${interval}`;
  
  // Check cache first
  if (cache.has(cacheKey)) {
    const { timestamp, data } = cache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log('Returning cached data for', cacheKey);
      return data;
    }
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Fetching candles for ${symbol} at ${interval} (attempt ${attempt})...`);
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const response = await axios.get(url, { timeout: 10000 });
      
      if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('Empty candle data received from Binance API');
      }

      const candles = response.data.map(c => ({
        time: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5])
      }));

      // Update cache
      cache.set(cacheKey, { timestamp: Date.now(), data: candles });
      console.log(`Successfully fetched ${candles.length} candles for ${symbol}`);
      
      return candles;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      if (attempt === retries) {
        console.error(`Failed after ${retries} attempts:`, error.message);
        throw new Error(`Failed to fetch candles after ${retries} attempts: ${error.message}`);
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Enhanced indicator calculation with validation
function calculateIndicators(candles) {
  try {
    if (!candles || candles.length < 50) {
      throw new Error('Insufficient candle data (need at least 50 candles)');
    }

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);

    // Calculate indicators with error handling for each
    const indicators = {
      sma: SMA.calculate({ period: 14, values: closes }).slice(-1)[0]?.toFixed(4) || 'N/A',
      ema: EMA.calculate({ period: 14, values: closes }).slice(-1)[0]?.toFixed(4) || 'N/A',
      rsi: RSI.calculate({ period: 14, values: closes }).slice(-1)[0]?.toFixed(2) || 'N/A',
      macd: (() => {
        try {
          const macd = MACD.calculate({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
          });
          const last = macd.slice(-1)[0];
          return last ? `${last.MACD.toFixed(4)}/${last.signal.toFixed(4)}` : 'N/A/N/A';
        } catch (e) {
          console.error('MACD calculation error:', e.message);
          return 'Error';
        }
      })(),
      stochastic: (() => {
        try {
          const stoch = Stochastic.calculate({
            high: highs,
            low: lows,
            close: closes,
            period: 14,
            signalPeriod: 3
          });
          const last = stoch.slice(-1)[0];
          return last ? `${last.k.toFixed(2)}/${last.d.toFixed(2)}` : 'N/A/N/A';
        } catch (e) {
          console.error('Stochastic calculation error:', e.message);
          return 'Error';
        }
      })(),
      adx: (() => {
        try {
          return ADX.calculate({ high: highs, low: lows, close: closes, period: 14 }).slice(-1)[0]?.toFixed(2) || 'N/A';
        } catch (e) {
          console.error('ADX calculation error:', e.message);
          return 'Error';
        }
      })(),
      williamsR: (() => {
        try {
          return WilliamsR.calculate({ high: highs, low: lows, close: closes, period: 14 }).slice(-1)[0]?.toFixed(2) || 'N/A';
        } catch (e) {
          console.error('WilliamsR calculation error:', e.message);
          return 'Error';
        }
      })(),
      obv: (() => {
        try {
          return OBV.calculate({ close: closes, volume: volumes }).slice(-1)[0]?.toFixed(2) || 'N/A';
        } catch (e) {
          console.error('OBV calculation error:', e.message);
          return 'Error';
        }
      })(),
      cci: (() => {
        try {
          return CCI.calculate({ high: highs, low: lows, close: closes, period: 20 }).slice(-1)[0]?.toFixed(2) || 'N/A';
        } catch (e) {
          console.error('CCI calculation error:', e.message);
          return 'Error';
        }
      })(),
      roc: (() => {
        try {
          return ROC.calculate({ period: 12, values: closes }).slice(-1)[0]?.toFixed(2) || 'N/A';
        } catch (e) {
          console.error('ROC calculation error:', e.message);
          return 'Error';
        }
      })(),
      momentum: (() => {
        try {
          return MOM.calculate({ period: 10, values: closes }).slice(-1)[0]?.toFixed(2) || 'N/A';
        } catch (e) {
          console.error('Momentum calculation error:', e.message);
          return 'Error';
        }
      })(),
      ultosc: (() => {
        try {
          return UltimateOscillator.calculate({ high: highs, low: lows, close: closes }).slice(-1)[0]?.toFixed(2) || 'N/A';
        } catch (e) {
          console.error('UltimateOscillator calculation error:', e.message);
          return 'Error';
        }
      })()
    };

    return indicators;
  } catch (error) {
    console.error('Error in calculateIndicators:', error.message);
    throw error;
  }
}

function detectTrend(candles) {
  try {
    if (!candles || candles.length < 2) {
      return { direction: 'Undetermined', change: '0%' };
    }

    const first = candles[0].close;
    const last = candles[candles.length - 1].close;
    const change = ((last - first) / first) * 100;
    const direction = change > 0 ? 'Bullish 🟢' : 'Bearish 🔴';
    return { direction, change: change.toFixed(2) + '%' };
  } catch (error) {
    console.error('Error in detectTrend:', error.message);
    return { direction: 'Error', change: 'N/A' };
  }
}

function calculateAccuracy(candles) {
  try {
    if (!candles || candles.length < 3) return 'N/A';

    let correct = 0;
    for (let i = 2; i < candles.length; i++) {
      const pred = candles[i - 1].close > candles[i - 2].close ? 'up' : 'down';
      const actual = candles[i].close > candles[i - 1].close ? 'up' : 'down';
      if (pred === actual) correct++;
    }
    return ((correct / (candles.length - 2)) * 100).toFixed(2) + '%';
  } catch (error) {
    console.error('Error in calculateAccuracy:', error.message);
    return 'N/A';
  }
}

function calculateSupportResistance(candles) {
  try {
    if (!candles || candles.length < 10) {
      return { support: 'N/A', resistance: 'N/A' };
    }

    const recent = candles.slice(-10);
    const lows = recent.map(c => c.low);
    const highs = recent.map(c => c.high);
    const support = Math.min(...lows);
    const resistance = Math.max(...highs);
    return { support: support.toFixed(4), resistance: resistance.toFixed(4) };
  } catch (error) {
    console.error('Error in calculateSupportResistance:', error.message);
    return { support: 'N/A', resistance: 'N/A' };
  }
}

async function getFearGreedIndex(retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 5000 });
      const value = response.data.data[0];
      return `${value.value} (${value.value_classification})`;
    } catch (error) {
      console.error(`Attempt ${attempt} failed for Fear & Greed Index:`, error.message);
      if (attempt === retries) {
        return 'Unavailable';
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Enhanced command handler with rate limiting
const userLastRequest = new Map();
const REQUEST_COOLDOWN = 15000; // 15 seconds

bot.onText(/\/(eth|btc|link|trx|bnb)(15m|30m|1h|4h|6h|12h|24h)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const now = Date.now();

  // Rate limiting
  if (userLastRequest.has(userId) && (now - userLastRequest.get(userId)) < REQUEST_COOLDOWN) {
    const remaining = Math.ceil((REQUEST_COOLDOWN - (now - userLastRequest.get(userId))) / 1000);
    return bot.sendMessage(chatId, `Please wait ${remaining} seconds before making another request.`);
  }
  userLastRequest.set(userId, now);

  const symbolKey = match[1].toLowerCase();
  const timeframeKey = match[2];

  if (!Object.keys(TIMEFRAMES).includes(timeframeKey)) {
    return bot.sendMessage(chatId, 'Invalid timeframe. Use one of: 15m, 30m, 1h, 4h, 6h, 12h, 24h.');
  }

  const symbol = SYMBOL_MAP[symbolKey];
  const interval = TIMEFRAMES[timeframeKey];

  try {
    // Send initial response
    const processingMsg = await bot.sendMessage(chatId, `🔄 Processing ${symbolKey.toUpperCase()} ${timeframeKey} data...`);

    // Fetch all data
    const [candles, fearGreed] = await Promise.all([
      getCandles(symbol, interval),
      getFearGreedIndex()
    ]);

    if (!candles || candles.length < 20) {
      await bot.editMessageText('❌ Insufficient data available for analysis. Please try a different timeframe.', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
      return;
    }

    // Calculate all indicators and metrics
    const indicators = calculateIndicators(candles);
    const trend = detectTrend(candles);
    const accuracy = calculateAccuracy(candles);
    const sr = calculateSupportResistance(candles);
    const lastPrice = candles[candles.length - 1].close.toFixed(4);

    // Generate TP/SL levels (example logic)
    const tp1 = (lastPrice * 1.01).toFixed(4);
    const tp2 = (lastPrice * 1.02).toFixed(4);
    const sl = (lastPrice * 0.98).toFixed(4);

    // Format the message
    const message = `📊 *${symbolKey.toUpperCase()} Trend Analysis (${timeframeKey})*

💰 *Price*: ${lastPrice}
🔥 *Overall Trend*: ${trend.direction} (${trend.change})
📉 *Support*: ${sr.support}
📈 *Resistance*: ${sr.resistance}
😨 *Fear & Greed Index*: ${fearGreed}

🎯 *Take Profit 1*: ${tp1}
🎯 *Take Profit 2*: ${tp2}
🛑 *Stop Loss*: ${sl}

📊 *Indicators*
- RSI: ${indicators.rsi} ${indicators.rsi > 70 ? '🔴 (Overbought)' : indicators.rsi < 30 ? '🟢 (Oversold)' : ''}
- MACD: ${indicators.macd}
- Stochastic: ${indicators.stochastic}
- ADX: ${indicators.adx}

📈 *Signal Accuracy*: ${accuracy}
📆 *Date & Time*: ${new Date().toLocaleString()}
🤖 *Bot by Mr Ronaldo*`;

    // Update the message
    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: processingMsg.message_id,
      parse_mode: 'Markdown'
    });

  } catch (error) {
    console.error('Full error in command handler:', error);
    const errorDetails = error.response 
      ? `API Error: ${error.response.status} ${error.response.statusText}`
      : error.message || 'Unknown error';

    bot.sendMessage(chatId, `❌ Error processing your request: ${errorDetails}\n\nPlease try again later.`);
  }
});

// Error handler for bot
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Start message
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMsg = `👋 Welcome to Mr Ronaldo's Crypto Analysis Bot!

📊 *Available Commands*:
/eth[timeframe] - Ethereum analysis (e.g., /eth1h)
/btc[timeframe] - Bitcoin analysis
/link[timeframe] - Chainlink analysis
/trx[timeframe] - Tron analysis
/bnb[timeframe] - Binance Coin analysis

🕒 *Timeframes*: 15m, 30m, 1h, 4h, 6h, 12h, 24h

Example: /eth1h for Ethereum 1-hour analysis

🤖 This bot provides technical analysis using multiple indicators to help identify market trends.`;

  bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
});

console.log('Bot is running and waiting for commands...');
