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
      { name: 'Open Long', value: 'To open a long, use:\n`!trade long <ticker>`\n`!t l <ticker>`' },
      { name: 'Open Short', value: 'To open a short, use:\n`!trade short <ticker>`\n`!t s <ticker>`' },
      { name: 'Close Position', value: 'To close a position, use:\n`!trade close <position number>`\n`!t c <position number>`\n`<position number>` comes from the `#` column in `!t p`.' },
      { name: 'Get Positions', value: 'To see open positions, use:\n`!trade positions`\n`!t p`\nAn optional user @ can also be used if you want to view someone else\'s positions:\n`!t p @cucurbit`'}
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

  /**
   * Builds a page for the positions table.
   * @param {number} pageNum Page number, should be 1 for the first call and then either increments or decrements depending on which way the user pages.
   * @returns {Object} Object that contains the text for the table and the maxPage so buildReactions() knows which paging reactions to show
  */
  let buildPositionsTable = (pageNum) => {
    let tokenDataTable = ["```diff", "\n  #|    ticker|pos  |          price"];
    let totalOpen = 0;
    let totalDiff = 0;

    const ITEMS_PER_PAGE = 5;
    const upperPageLimit = pageNum * ITEMS_PER_PAGE + 1;

    // i is the starting index to display for positions
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
          priceDiff = tokenData.usd - row.openprice;
        }
        else {
          priceDiff = row.openprice - tokenData.usd;
        }

        let priceDirection = priceDiff >= 0 ? '+' : '-';

        tokenDataTable.push(`\n---|----------|-----|---------------`);
        tokenDataTable.push(`\n${priceDirection}${utils.padString('  ', i, true)}|${utils.padString('          ', row.ticker, true)}|${utils.padString('     ', row.position.toUpperCase(), false)}|chg $${utils.padString('           ', utils.padString('          ', priceDiff.toFixed(2), true), false)}`);
        tokenDataTable.push(`\n${priceDirection}  |${utils.padString('          ', dateformat(row.opendatetime, "yyyy-mm-dd"), true)}|     | o: $${utils.padString('           ', utils.padString('          ', parseFloat(row.openprice).toFixed(2), true), false)}`);
        tokenDataTable.push(`\n${priceDirection}  |          |     | c: $${utils.padString('          ', utils.padString('          ', tokenData.usd.toFixed(2), true), false)}`); // (${((priceDiff / row.openprice) * 100).toFixed(2)}%)`);
        
        totalOpen += parseFloat(row.openprice);
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

  /**
   * Display reactions for paging, if applicable.
   * @param {number} pageNum Page number, should be 1 for the first call and then either increments or decrements depending on which way the user pages.
   * @param {number} maxPage Max page number as determined by the number of positions and number of positions per page. Used in conjunction with the current pageNum to decide which paging reactions to show.
   * @param {Object} sentEmbed References the message that we should add our paging reactions to.
  */
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

    // Only detect when the message author reacts with either ◀ or ▶
    const filter = (reaction, user) => {
      return user.id === msg.author.id && reaction.emoji.name === '▶' || reaction.emoji.name === '◀';
    };
    // Create a listener for reaction events using the filter. It goes to Heaven after 2 minutes.
    let collector = sentEmbed.createReactionCollector(filter, { time: 120000 });
    collector.on('collect', (reaction, user) => {
      // If a valid reaction is detected, figure out which kind it were and decrement or increment pageNum as necessary.
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
        // Rebuild the positions table page with the new pageNum.
        let positionsTable = buildPositionsTable(pageNum);
        maxPage = positionsTable.maxPage;
        sentEmbed.edit(positionsTable.table);
        // Clear out the paging reactions if they exist
        sentEmbed.reactions.removeAll().catch(error => console.error('Failed to clear reactions: ', error))
        .then(() => {
          if (pageNum == 1 && pageNum != maxPage) { // If it's the first page, there're more pages, then only show 'Next Page' reaction.
            sentEmbed.react('▶');
          }
          else if (pageNum == maxPage) {            // If it's the last page, then only show the 'Previous Page' button.
            sentEmbed.react('◀');
          }
          else {                                    // If it ain't the first or last page, show both buttons.
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

  // First call to build the positions table.
  // After this it's called recursively if the user changes pages.
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

  pgClient.query('INSERT INTO positions(discorduserid, ticker, position, openprice, opendatetime) VALUES($1, $2, $3, $4, current_timestamp) RETURNING *',
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