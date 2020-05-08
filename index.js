/** ------------------------------------------------------------------------------------------------
 * 
 *                        ,------.,--.                 ,-----.           ,--.   
 *                        |  .---'|  | ,---. ,--.  ,--.|  |) /_  ,---. ,-'  '-. 
 *                        |  `--, |  || .-. : \  `'  / |  .-.  \| .-. |'-.  .-' 
 *                        |  |`   |  |\   --. /  /.  \ |  '--' /' '-' '  |  |   
 *                        `--'    `--' `----''--'  '--'`------'  `---'   `--'   
 *  
 *      Program:  FlexBot                                                   
 *       Author:  Piper
 *                  Discord:  cucurbit
 *                   Reddit:  piper_cucu
 *                  Twitter:  @PiperCucu
 *                   GitHub:  pipercucu
 *
 *  Description:  Discord bot for pulling cryptocurrency price data and logging trading positions
 * 
 *                                ♡ Made with love in Alabama, USA
 * -------------------------------------------------------------------------------------------------*/
'use strict'

const auth = require('./auth.json');
const coinGeckoCmds = require('./coinGeckoCmds.js');
const Discord = require('discord.js');
const fs = require('fs');
const randomCmds = require('./randomCmds.js');
const reactionsCmds = require('./reactionsCmds.js');
const tradeCmds = require('./tradeCmds.js');
const utils = require('./utils.js');

const bot = new Discord.Client();

// Ready up activities
bot.on('ready', () => {
  console.log(`Logged in as ${bot.user.tag}!`);
  bot.user.setActivity(`😀 !help`);

  // If the lookups don't exist, run the loader
  fs.access("./common/coinGeckoLookups.json", err => { if (!err) { } else { coinGeckoCmds.loadLookupJson(); } });
});

// Handle incoming commands
bot.on('message', async msg => {
  reactionsCmds.react(msg);

  // Check if it's using our prefix, todo: make prefix configurable.
  if (msg.content.substring(0, 1) !== '!') return;

  // Arguments are space delineated, but we need to do something special for arguments that are in quotes.
  // We wanna take input like !p eth btc "enjin coin" piper
  // and end up with an array like ["p", "eth", "btc", "enjin coin", "piper"]
  // Split out args by quotes, and then replace each space with a placeholder.
  let splitQuotes = msg.content.substring(1).split('"');
  if (splitQuotes.length > 1) {
    splitQuotes.forEach((splitString, i) => {
      if(splitString.slice(-1) !== ' ' && splitString.slice(0, 1) !== ' ') {
        splitQuotes[i] = splitString.split(' ').join('|||||');
      }
    });
  }

  // Join em back by quotes and then split em by space, and then replace placeholders back with spaces.
  let args = splitQuotes.join('"');
  args = args.split(' ');  
  for (let i in args) {
    args[i] = args[i].split('|||||').join(' ').split('"').join("");
  }

  // The command is the first argument. See if the command is mapped and then run it.
  let cmd = args[0];
  let botCmd = botCmdMap[cmd];
  if (botCmd) botCmd(msg, args, bot);
});

// Map of all the bot commands, in alphabetical order
// h, help: display help dialog
// p, price: takes tickers or coin names as arguments and then shows a table of prices
// ping: says "pong"
// r, random: methods for larkin around
// t, trade: opens or views trading positions
let botCmdMap = {
  'h': msg => {
    botCmdMap['help'](msg);
  },
  'help': msg => {
    const helpEmbed = {
      title: 'FlexBot Help',
      description: 'FlexBot is a Discord bot for pulling cryptocurrency price data and logging trading positions. ♡ Made with love in Alabama, USA.',
      fields: [
        {
          name: 'Check Prices',
          value: 'To show a table of token prices, use:\n`!price <ticker1, ticker2, ...>`\n`!p <ticker1, ticker2, ...>`'
            + '\ne.g.: `!p eth btc "enjin coin" xmr`'
        },
        { name: 'Trading', value: 'To open a list of options for logging and seeing trades, use:\n`!trade`\n`!t`' },
        { name: 'Random', value: 'For larkin around:\n`!random`\n`!r`' }
      ]
    }
    msg.channel.send({ embed: helpEmbed });
  },
  'p': async (msg, args) => {
    botCmdMap['price'](msg, args);
  },
  'ping': msg => {
    msg.reply('```Pong!```');
  },
  'price': async (msg, args) => {
    args.shift();
    if (args.length == 0) {
      args = ['BTC'];
    }

    try {
      let tokenDataArr = ["```diff", "\n   ticker | price        | 24hr % chg"];
      let data = await coinGeckoCmds.getPrice(args);
      let foundTokenKeys = Object.keys(data.found);
      foundTokenKeys.forEach(key => {
        let tokenData = data.found[key];
        tokenDataArr.push(`\n${tokenData.usd_24h_change >= 0 ? '+' : '-'} ${utils.padString('       ', key, true)} | $${utils.padString('           ', tokenData.usd, false)} | ${Math.ceil(tokenData.usd_24h_change * 100) / 100}`);
      });
      tokenDataArr.push("```");
      if (tokenDataArr.length > 3) {
        msg.channel.send(tokenDataArr.join(''));
      }
      if (data.unfound.length > 0) {
        msg.channel.send("```Could not find search term(s): \"" + data.unfound.join(', ') + "\"```")
      }
    } catch (err) {
      console.log(err);
      msg.channel.send("```Something bad done happened :(```")
    }
  },
  'r': async (msg, args, bot) => {
    botCmdMap['random'](msg, args, bot);
  },
  'random': async (msg, args, bot) => {
    randomCmds.random(msg, args, bot);
  },
  't': async (msg, args, bot) => {
    botCmdMap['trade'](msg, args, bot);
  },
  'trade': async (msg, args, bot) => {
    tradeCmds.trade(msg, args, bot);
  }
}

bot.login(auth.discordBotToken);