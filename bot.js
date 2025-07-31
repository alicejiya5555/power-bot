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

let symbol = 'ETHUSDT';
let timeframe = '1h';

const symbols = ['eth', 'btc', 'link'];
const timeframes = ['15m', '30m', '1h', '4h', '12h'];

function formatValue(value, decimals) {
  return (Number(value) / Math.pow(10, decimals)).toFixed(4);
}

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

let lastTxHashes = new Set();

async function checkWallets() {
  let alerts = [];
  for (const wallet of trackedWallets) {
    const transactions = await fetchRecentTxs(wallet.address);
    for (const tx of transactions) {
      if (lastTxHashes.has(tx.hash)) continue;
      lastTxHashes.add(tx.hash);

      const direction = tx.to.toLowerCase() === wallet.address.toLowerCase() ? '🟢 Deposit' : '🔴 Withdrawal';
      const valueFormatted = formatValue(tx.value, tx.tokenDecimal);

      const message = `🐋 *Whale Alert!*\n\n👤 Wallet: ${wallet.name}\n💠 Token: ${tx.tokenSymbol}\n💰 Amount: ${valueFormatted}\n➡️ Direction: ${direction}\n🔗 [View Transaction](https://etherscan.io/tx/${tx.hash})`;
      alerts.push(message);
    }
  }
  return alerts;
}

bot.command('whale', async (ctx) => {
  ctx.reply('🔍 Checking whale activity...');
  const alerts = await checkWallets();
  if (alerts.length === 0) return ctx.reply('No new whale transactions found.');
  for (const alert of alerts) {
    await ctx.reply(alert, { parse_mode: 'Markdown' });
  }
});

symbols.forEach((symbolKey) => {
  timeframes.forEach((tf) => {
    const command = `/${symbolKey}${tf}`;

    bot.command(command.slice(1), async (ctx) => {
      const asset = symbolKey.toUpperCase();
      const interval = tf;

      symbol = `${asset}USDT`;
      timeframe = tf;

      ctx.reply(`📊 ${asset} ${interval} analysis loading...`);

      // Simulated response
      ctx.reply(`✅ Trend: Bullish\n💧 Liquidity Zone: 0.05% below\n🎯 TP/SL Recommendation:\n- TP: 5%\n- SL: 1.5%`);
    });
  });
});

bot.start((ctx) => {
  ctx.reply(`Welcome to the Trading Bot 🤖\n\nCommands:\n/set a pair + timeframe: /btc1h /eth4h etc\n/whale - Whale transactions alert\nMore features coming soon.`);
});

setInterval(async () => {
  const alerts = await checkWallets();
  if (alerts.length > 0) {
    for (const alert of alerts) {
      await bot.telegram.sendMessage(CHAT_ID, alert, { parse_mode: 'Markdown' });
    }
  }
}, 5 * 60 * 1000);

bot.launch();
console.log('🤖 Unified Trading Helper Bot is running...');
