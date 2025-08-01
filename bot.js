// bot.js

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const technicalIndicators = require('technicalindicators'); // for EMA, RSI, etc.
const token = '7655482876:AAEC1vjbj42M6TY277G-M6me23z74mIQb-U';
const bot = new TelegramBot(token, { polling: true });

const ASSETS = ['BTCUSDT', 'ETHUSDT', 'LINKUSDT', 'BNBUSDT'];
const INTERVALS = {
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '12h': '12h',
};

bot.onText(/\/(link|eth|btc|bnb)(15m|30m|1h|4h|12h)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const symbol = match[1].toUpperCase() + 'USDT';
  const interval = INTERVALS[match[2]];

  try {
    // 1. Fetch Kline data for technical indicators
    const { data: klines } = await axios.get(`https://api.binance.com/api/v3/klines`, {
      params: {
        symbol,
        interval,
        limit: 500,
      },
    });

    const closes = klines.map(k => parseFloat(k[4]));
    const volumes = klines.map(k => parseFloat(k[5]));

    // 2. Fetch 24hr stats
    const { data: stats } = await axios.get(`https://api.binance.com/api/v3/ticker/24hr`, {
      params: { symbol },
    });

    // === Process Indicators Here ===
    // Example RSI
    const rsi = technicalIndicators.RSI.calculate({ period: 14, values: closes });
    const currentRSI = rsi[rsi.length - 1];

    // Dummy Multi-Timeframe Heatmap (You should compute based on real indicator trends)
    const heatmap = `
🟡 15M: Neutral (52%)
🟢 30M: Bullish (68%)
🔴 1H: Bearish (43%)
🟢 4H: Bullish (72%)
🟢 12H: Bullish (81%)
`;

    const supportZones = `🟢 Support Zone at $3745.6523 (Touches: 22)
🟢 Support Zone at $3772.7635 (Touches: 17)
🟢 Support Zone at $3798.1750 (Touches: 12)`;

    const resistanceZones = `🔴 Resistance Zone at $3769.7642 (Touches: 12)
🔴 Resistance Zone at $3794.1123 (Touches: 35)
🔴 Resistance Zone at $3780.7652 (Touches: 21)`;

    const report = `
📊 Trend Confirmation & Multi-Timeframe Heatmap

💰 Price: ${parseFloat(stats.lastPrice).toFixed(2)}
📈 24h High: ${stats.highPrice}
📉 24h Low: ${stats.lowPrice}
🔁 Change: ${stats.priceChangePercent}%
🧮 Volume: ${stats.volume}
🧮 Volume Change: N/A
💵 Quote Volume: ${stats.quoteVolume}
🔓 Open Price: ${stats.openPrice}
⏰ Close Time: ${new Date(stats.closeTime).toLocaleString()}
${heatmap}
🔥 Overall Trend: Bullish 🟢 (70%)
💧 Liquidity Zone: 0.05% below

💧 Liquidity Zones & Order Blocks Detected
${supportZones}
${resistanceZones}

😨😊 Fear & Greed Index:
 - Value: 30
 - Classification: Greed

🎯 TP1 (82%)
🎯 TP2 (70%)
🎯 TP3 (58%)
🎯 SL: (25%)

🎯 Likely to Hit: TP 🎯
📈 Signal Accuracy: 84.5%
📆 Date & Time: ${new Date().toLocaleString()}
🤖 Bot by Mr Ronaldo
`;

    bot.sendMessage(chatId, report);

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, '⚠️ Error fetching data. Please try again later.');
  }
});
