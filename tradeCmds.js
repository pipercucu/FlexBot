'use strict'
const dateformat = require('dateformat');
const dbCmds = require('./dbCmds');
const coinGeckoCmds = require('./coinGeckoCmds.js');
const utils = require('./utils.js');

module.exports = {
  trade: trade
}

let positionCache;

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
      let pageNum = 1;
      if (args.length > 2) {
        for (let arg of args) {
          let parsedUserId = utils.parseDiscordUserId(arg);
          if (parsedUserId) {
            posDiscordUserId = parsedUserId;
          }
          /*
          let parsedPageNum = utils.parsePageNum(arg);
          if (parsedPageNum) {
            pageNum = parsedPageNum;
          }
          */
        }
      }
      getPositions(msg, posDiscordUserId, pageNum, bot);
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
async function getPositions(msg, discordUserId, pageNum, bot) {
  const pgClient = dbCmds.getPgClient();
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

  let res;
  try {
    res = await pgClient.query('SELECT * FROM positions WHERE discorduserid = $1 ORDER BY opendatetime', [discordUserId]);
  }
  catch (err) {
    msg.reply('```Sorry hun, there was a database error :(```');
  }

  let discordUserObj = await bot.users.fetch(discordUserId);

  let buildPositionsTable = (pageNum) => {
    let tokenDataTable = ["```diff", "\n  #|    ticker|pos  |          price"];
    let totalOpen = 0;
    let totalDiff = 0;

    const ITEMS_PER_PAGE = 5;
    const upperPageLimit = pageNum * ITEMS_PER_PAGE + 1;

    // i is the starting index to display
    // If pageNum is 1, then i = 1
    // If pageNum is 2, then i = 6, etc
    let i = (pageNum - 1) * ITEMS_PER_PAGE;      
    for (let j in res.rows) {       // j is the current row
      if (i === upperPageLimit) {   // If i === the upper page limit, break; Upper page limit is 6 if pageNum is 1, 11 if pageNum is 2 etc
        break;
      }
      if (j < i) {                  // If row < starting index then skip it
        continue;
      }
      else {
        let row = res.rows[j];
        let tokenData = tokenDataLookup[row.ticker];
        let priceDiff;
        if (row.position.toUpperCase() === 'LONG') {
          priceDiff = tokenData.usd - row.price;
        }
        else {
          priceDiff = row.price - tokenData.usd;
        }

        let priceDirection = priceDiff >= 0 ? '+' : '-';

        tokenDataTable.push(`\n---|----------|-----|---------------`);
        tokenDataTable.push(`\n${priceDirection}${utils.padString('  ', i, true)}|${utils.padString('          ', row.ticker, true)}|${utils.padString('     ', row.position.toUpperCase(), false)}|chg $${utils.padString('           ', utils.padString('          ', priceDiff.toFixed(2), true), false)}`);
        tokenDataTable.push(`\n${priceDirection}  |${utils.padString('          ', dateformat(row.opendatetime, "yyyy-mm-dd"), true)}|     | o: $${utils.padString('           ', utils.padString('          ', parseFloat(row.price).toFixed(2), true), false)}`);
        tokenDataTable.push(`\n${priceDirection}  |          |     | c: $${utils.padString('          ', utils.padString('          ', tokenData.usd.toFixed(2), true), false)}`); // (${((priceDiff / row.price) * 100).toFixed(2)}%)`);
        
        totalOpen += parseFloat(row.price);
        totalDiff += priceDiff;
        i++;
      }
    }
    let maxPage = Math.floor(res.rows.length/5) + ((res.rows.length % 5 == 0) ? 0 : 1);
    // tokenDataTable.push(`\n\n${totalDiff >= 0 ? '+' : '-'} Total PnL: $${totalDiff.toFixed(2)} (${((totalDiff / totalOpen) * 100).toFixed(2)}%)`);
    tokenDataTable.push(`\n\n${res.rows.length} open positions\nPage ${pageNum} of ${maxPage}`);
    tokenDataTable.push("```");
    return {
      table: '`' + discordUserObj.username + '#' + discordUserObj.discriminator + '\'s Trading Positions`\n' + tokenDataTable.join(''),
      maxPage: maxPage
    }
  }

  let buildReactions = (pageNum, maxPage, sentEmbed) => {
    if (pageNum == 1 && pageNum != maxPage) {
      sentEmbed.react('▶');
    }
    else if (pageNum == maxPage) {
      sentEmbed.react('◀');
    }
    else {
      sentEmbed.react('◀')
        .then(() => sentEmbed.react('▶'));
    }

    const filter = (reaction, user) => {
      return user.id === msg.author.id && reaction.emoji.name === '▶' || reaction.emoji.name === '◀';
    };
    let collector = sentEmbed.createReactionCollector(filter, { time: 120000 });
    collector.on('collect', (reaction, user) => {
      if (user.id === msg.author.id) {
        switch (reaction.emoji.name) {
          case '▶':
            pageNum++;
            break;
          case '◀':
            pageNum--;
            break;
          default:
        }
        let positionsTable = buildPositionsTable(pageNum);
        maxPage = positionsTable.maxPage;
        sentEmbed.edit(positionsTable.table);
        sentEmbed.reactions.removeAll().catch(error => console.error('Failed to clear reactions: ', error))
        .then(() => {
          if (pageNum == 1 && pageNum != maxPage) {
            sentEmbed.react('▶');
          }
          else if (pageNum == maxPage) {
            sentEmbed.react('◀');
          }
          else {
            sentEmbed.react('◀')
              .then(() => sentEmbed.react('▶'));
          }
        });
      }
    });
    collector.on('end', collected => {
      sentEmbed.reactions.removeAll().catch(error => console.error('Failed to clear reactions: ', error));
    });
  }

  try {
    let positionsTable = buildPositionsTable(pageNum);
    let maxPage = positionsTable.maxPage;
    msg.reply(positionsTable.table)
      .then(sentEmbed => {
        buildReactions(pageNum, maxPage, sentEmbed);
      });

    pgClient.end();
  }
  catch (err) {
    console.log(err);
    msg.reply('```Sorry hun, there was a database error :(```');
    pgClient.end();
  }
}

/**
 * Open a position for a given user.
 * @param {object} msg Used by the bot to reply back or send messages in the discord server
 * @param {number} discordUserId Unique id for user in discord, used to pull back positions by user
 * @param {string} position Either 'long' or 'short'
 * @param {string} searchTerm The coin to open a position on, e.g. 'ETH' or 'ethereum'
*/
async function openPosition(msg, discordUserId, position, searchTerm) {
  const pgClient = dbCmds.getPgClient();
  pgClient.connect();

  let tokenData;
  try {
    tokenData = await coinGeckoCmds.getPrice([searchTerm])
    if (tokenData.unfound.length > 0) {
      msg.reply("```Could not find search term: \"" + tokenData.unfound[0] + "\"```")
      return;
    }
    else {
      let tokenDataKeys = Object.keys(tokenData.found);
      tokenData = tokenData.found[tokenDataKeys[0]];
    }
  }
  catch (err) {
    console.log(err);
    msg.reply("```Could not find search term: \"" + searchTerm + "\"```")
    return;
  }

  pgClient.query('INSERT INTO positions(discorduserid, ticker, position, price, opendatetime) VALUES($1, $2, $3, $4, current_timestamp) RETURNING *',
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