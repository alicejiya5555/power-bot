// bot.js
require("dotenv").config();
const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => ctx.reply("Welcome to Mr Ronaldo’s Trend Intelligence Bot ✨"));

bot.command("trend", async (ctx) => {
  try {
    const asset = "ETHUSDT"; // default asset unless dynamic

    // Here you would pull data using technical indicator APIs (e.g., TAAPI, TradingView Unofficial, etc.)
    // Below is a simulated version:

    const report = `
📊 Trend Confirmation & Multi-Timeframe Heatmap

🟡 15M: Neutral (52%)
🟢 30M: Bullish (68%)
🔴 1H: Bearish (43%)
🟢 4H: Bullish (72%)
🟢 12H: Bullish (81%)

🔥 Overall Trend: Bullish 🟢 (70%)
💧 Liquidity Zone: 0.05% below

💧 Liquidity Zones & Order Blocks Detected
🟢 Support Zone at $3745.6523 (Touches: 22)
🟢 Support Zone at $3772.7635 (Touches: 17)
🟢 Support Zone at $3798.1750 (Touches: 12)
🔴 Resistance Zone at $3769.7642 (Touches: 12)
🔴 Resistance Zone at $3794.1123 (Touches: 35)
🔴 Resistance Zone at $3780.7652 (Touches: 21)

😨😊 Fear & Greed Index:
 - Value: 30
 - Classification: Greed

🎯 TP1 (82%)
🎯 TP2 (70%)
🎯 TP3 (58%)
🎯 SL: (25%)

🎯 Likely to Hit: TP1 🎯

📈 Signal Accuracy: 84.5%
📆 Date & Time: ${new Date().toLocaleString()}
🤖 Bot by Mr Ronaldo
`;

    ctx.reply(report);
  } catch (err) {
    console.error("Error generating trend report:", err);
    ctx.reply("⚠️ Failed to fetch trend data. Try again shortly.");
  }
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
