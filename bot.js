const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// Replace with your actual Telegram Bot Token
const token = '7655482876:AAHBoC3JyOftHx1fABIurM-LpVkkjtwView';

const bot = new TelegramBot(token, { polling: true });
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Crypto Trend Bot is alive and well.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Helper: Map user input like "eth" to Binance symbol "ETHUSDT"
function formatSymbol(userSymbol) {
  return userSymbol.toUpperCase() + 'USDT';
}

// Helper: Validate timeframe
const validTimeframes = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M'];
function isValidTimeframe(tf) {
  return validTimeframes.includes(tf);
}

// Main command handler, e.g. /eth1h, /link15m
bot.onText(/^\/([a-zA-Z]+)(\d+[mhdwM])$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userSymbol = match[1];
  const userTimeframe = match[2];

  if (!isValidTimeframe(userTimeframe)) {
    bot.sendMessage(chatId, `⛔ Invalid timeframe '${userTimeframe}'. Valid options: ${validTimeframes.join(', ')}`);
    return;
  }

  const symbol = formatSymbol(userSymbol);

  try {
    // Fetch klines (candlesticks) data for requested timeframe
    const klinesUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${userTimeframe}&limit=50`;
    const klinesRes = await axios.get(klinesUrl);
    const klines = klinesRes.data;

    if (!klines.length) {
      bot.sendMessage(chatId, `⚠️ No data returned for ${symbol} at ${userTimeframe}`);
      return;
    }

    // Latest candle
    const latest = klines[klines.length - 1];

    const open = parseFloat(latest[1]);
    const high = parseFloat(latest[2]);
    const low = parseFloat(latest[3]);
    const close = parseFloat(latest[4]);
    const volume = parseFloat(latest[5]);
    const closeTime = new Date(latest[6]).toLocaleString();

    // Calculate Change % from open to close candle
    const changePercent = ((close - open) / open) * 100;

    // Fetch 24h ticker stats for price, high, low, change, volume etc
    const tickerUrl = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
    const tickerRes = await axios.get(tickerUrl);
    const ticker = tickerRes.data;

    // Volume change: compare latest candle volume with previous candle volume
    let volChangePercent = 0;
    if (klines.length >= 2) {
      const prevVolume = parseFloat(klines[klines.length - 2][5]);
      volChangePercent = ((volume - prevVolume) / prevVolume) * 100;
    }

    // For demo: simple trend based on price change percent
    const trendLabel = changePercent > 0.5 ? 'Bullish 🟢' : changePercent < -0.5 ? 'Bearish 🔴' : 'Neutral 🟡';

    // Format message (simplified to your requested style)
    const message = `
📊 Trend Confirmation & Multi-Timeframe Heatmap

💰 Price: ${close.toFixed(6)}
📈 24h High: ${parseFloat(ticker.highPrice).toFixed(6)}
📉 24h Low: ${parseFloat(ticker.lowPrice).toFixed(6)}
🔁 Change: ${parseFloat(ticker.priceChangePercent).toFixed(2)}%

🟡 ${userTimeframe.toUpperCase()}: ${trendLabel} (${changePercent.toFixed(2)}%)

🔥 Overall Trend: ${trendLabel} (${changePercent.toFixed(2)}%)
💧 Liquidity Zone: N/A

💧 Liquidity Zones & Order Blocks Detected
🟢 Support Zone at $N/A (Touches: N/A)
🔴 Resistance Zone at $N/A (Touches: N/A)

😨😊 Fear & Greed Index:
 - Value: N/A
 - Classification: N/A

🎯 TP1 (82%): N/A
🎯 TP2 (70%): N/A
🎯 TP3 (58%): N/A
🛑 SL (25%): N/A

📈 Volume ${volChangePercent >= 0 ? 'Increased' : 'Decreased'} by ${Math.abs(volChangePercent).toFixed(2)}%

📈 Signal Accuracy: N/A
📆 Date & Time: ${closeTime}
🤖 Bot by Mr Ronaldo
    `;

    bot.sendMessage(chatId, message.trim());
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, `❌ Error fetching data for symbol: ${symbol} timeframe: ${userTimeframe}`);
  }
});
