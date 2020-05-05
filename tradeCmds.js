'use strict'
const auth = require('./auth.json');
const fs = require('fs');
const coinGeckoCmds = require('./coinGeckoCmds.js');
const coinGeckoLookups = require('./common/coinGeckoLookups.json')
const CoinGecko = require('coingecko-api');
const pg = require('pg');
const utils = require('./utils.js');

const CoinGeckoClient = new CoinGecko();

module.exports = {
  trade: trade
}

async function trade(msg, args, bot) {
  const discordUserId = msg.author.id;
  const helpEmbed = {
    title: 'Trading Commands',
    fields: [
      { name: 'Open Long', value: 'Use `!trade long <ticker>` or `!t l <ticker>` to open a long.' },
      { name: 'Open Short', value: 'Use `!trade short <ticker>` or `!t s <ticker>` to open a short.' },
      { name: 'Get Positions', value: 'Use `!trade positions` or `!t p` to see your positions.' },
    ]
  }
  
  if (args.length === 1) {
    msg.reply({ embed: helpEmbed });
    return;
  }

  const cmd = args[1].toLowerCase();

  switch (cmd) {
    case 'l':
    case 'long':
      if (args.length < 3) {
        msg.reply({
          embed: {
            fields: [ { value: 'Requires a <ticker> to long. e.g.: `!t l eth`' } ]
          }
        });
      }
      else {
        openPosition(msg, discordUserId, 'long', args[2]);
      }
      break;
    case 's':
    case 'short':
      if (args.length < 3) {
        msg.reply({
          embed: {
            fields: [ { value: 'Requires a <ticker> to short. e.g.: `!t s eth`' } ]
          }
        });
      }
      else {
        openPosition(msg, discordUserId, 'short', args[2]);
      }
      break;
    case 'p':
    case 'pos':
    case 'position':
    case 'positions':
      let posDiscordUserId = discordUserId;
      if (args.length > 2) {
        let parsedUserId = utils.parseDiscordUserId(args[2]);
        if (parsedUserId) {
          posDiscordUserId = parsedUserId;
        }
      }
      getPositions(msg, posDiscordUserId, bot);
      break;
    default:
      msg.reply({ embed: helpEmbed });
  }
}

/**
 * Get and display the positions for a given user.
 * @param {object} msg Used by the bot to reply back or send messages in the discord server
 * @param {number} discordUserId Unique id for user in discord, used to pull back positions by user
*/
async function getPositions(msg, discordUserId, bot) {
  const pgClient = getPgClient();
  pgClient.connect();

  let distinctTickers = [];
  let tokenDataLookup = [];

  try {
    let res = await pgClient.query('SELECT DISTINCT ticker FROM positions WHERE discorduserid = $1', [discordUserId]);
    res.rows.forEach(row => {
      distinctTickers.push(row.ticker);
    });
  }
  catch (err) {
    console.log(err);
    msg.reply('```Sorry hun, there was a database error :(```');
    pgClient.end();
    return;
  }

  try {
    let data = await coinGeckoCmds.getPrice(distinctTickers);
    tokenDataLookup = data.found;
  } catch (err) {
    console.log(err);
    msg.channel.send("```Something bad done happened :(```")
  }

  try {
    let res = await pgClient.query('SELECT * FROM positions WHERE discorduserid = $1', [discordUserId]);
    let tokenDataTable = ["```diff", "\n ticker | pos   | price"];
    let totalOpen = 0;
    let totalDiff = 0;
    res.rows.forEach(row => {
      tokenDataTable.push(`\n${utils.padString('       ', row.ticker, true)} | ${utils.padString('     ', row.position.toUpperCase(), false)} | o: $${utils.padString('           ', utils.padString('          ', parseFloat(row.price).toFixed(2), true), false)} ${new Intl.DateTimeFormat().format(row.datetime)}`);
      let tokenData = tokenDataLookup[row.ticker];
      tokenDataTable.push(`\n        |       | c: $${utils.padString('          ', utils.padString('          ', tokenData.usd.toFixed(2), true), false)}`);
      let priceDiff;
      if (row.position.toUpperCase() === 'LONG') {
        priceDiff = tokenData.usd - row.price;
      }
      else {
        priceDiff = row.price - tokenData.usd;
      }
      tokenDataTable.push(`\n${priceDiff >= 0 ? '+' : '-'}       |       |    $${utils.padString('           ', utils.padString('          ', priceDiff.toFixed(2), true), false)} (${((priceDiff / row.price) * 100).toFixed(2)}%)`);
      totalOpen += parseFloat(row.price);
      totalDiff += priceDiff;
    });
    tokenDataTable.push(`\n\n${totalDiff >= 0 ? '+' : '-'} Total PnL: $${totalDiff.toFixed(2)} (${((totalDiff / totalOpen) * 100).toFixed(2)}%)`);
    tokenDataTable.push("```");
    let discordUserObj = await bot.users.fetch(discordUserId);
    msg.reply('`' + discordUserObj.username + '#' + discordUserObj.discriminator + '\'s Portfolio`\n' + tokenDataTable.join(""));
    pgClient.end();
  }
  catch (err) {
    console.log(err);
    msg.reply('```Sorry hun, there was a database error :(```');
    pgClient.end();
  }
}

async function openPosition(msg, discordUserId, position, searchTerm) {
  const pgClient = getPgClient();
  pgClient.connect();

  let tokenData;
  try {
    tokenData = await coinGeckoCmds.getPrice(searchTerm)
  }
  catch (err) {
    console.log(err);
    msg.reply("```Could not find search term: \"" + " searchTerm\"```")
    return;
  }

  pgClient.query('INSERT INTO positions(discorduserid, ticker, position, price, datetime) VALUES($1, $2, $3, $4, current_timestamp) RETURNING *',
    [discordUserId, tokenData.ticker, position, tokenData.usd],
    (err, res) => {
      if (err) {
        console.log(err);
        msg.reply('```Sorry hun, there was a database error :(```');
      }
      else {
        msg.reply("```Opened " + position + " on " + tokenData.ticker + " at $" + tokenData.usd + "!```");
      }
      pgClient.end();
    });
}

//-========== [ Helper Functions ] ==========-

function getPgClient() {
  return new pg.Client({
    user: auth.pgConfig.user,
    host: auth.pgConfig.host,
    database: auth.pgConfig.database,
    password: auth.pgConfig.password,
    port: auth.pgConfig.port
  });
}