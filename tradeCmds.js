'use strict'
const dateformat = require('dateformat');
const dbCmds = require('./dbCmds');
const coinGeckoCmds = require('./coinGeckoCmds.js');
const utils = require('./utils.js');

module.exports = {
  trade: trade
}

let positionsCache = {};

async function trade(msg, args, bot) {
  const discordUserId = msg.author.id;
  const helpEmbed = {
    title: 'Trading Commands',
    fields: [
      { name: 'Open Long', value: 'To open a long, use:\n```!trade long <ticker>\n!t l <ticker>```' },
      { name: 'Open Short', value: 'To open a short, use:\n```!trade short <ticker>\n!t s <ticker>```' },
      { name: 'Close Position', value: 'To close a position, use:\n```!trade close <position number>\n!t c <position number>```\n`<position number>` comes from the `#` column in `!t p`.' },
      { name: 'Get Positions', value: 'To see open positions, use:\n```!trade positions\n!t p```\nAn optional user @ can also be used if you want to view someone else\'s positions:\n`!t p @cucurbit`'}
    ]
  }
  
  if (args.length === 1) {
    msg.reply({ embed: helpEmbed });
    return;
  }

  const cmd = args[1].toLowerCase();

  switch (cmd) {
    case 'c':
    case 'close':
      if (args.length < 3) {
        msg.reply({
          embed: {
            fields: [ { value: 'Requires a position # to close. e.g.: `!t l 3`. Run `!t p` to see your open positions and the position #\'s' } ]
          }
        });
      }
      else {
        closePosition(msg, args[2]);
      }
      break;
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
        }
      }
      getPositions(msg, posDiscordUserId, pageNum, bot);
      break;
    default:
      msg.reply({ embed: helpEmbed });
  }
}

/**
 * Closes a position by position number given in '!t p'.
 * @param {object} msg Used by the bot to reply back or send messages in the discord server
 * @param {number} posId Position number given in '!t p'
*/
async function closePosition(msg, posId) {
  // First check if the msg.author.id is in the positionsCache
  let positions = positionsCache[msg.author.id];
  let position;
  if (positions) {
    position = positions.find(e => e.posId == posId)
  }
  if (position) {
    if (position.closed === true) {
      msg.reply('```' + `That position was already closed. Run '!t p' to see your open positions and regenerate ids for closing.` + '```');
      return;
    }
    const pgClient = dbCmds.getPgClient();
    pgClient.connect();

    let currPrice;
    try {
      let data = await coinGeckoCmds.getPrice([position.ticker]);
      currPrice = data.found[position.ticker].usd;
    } catch (err) {
      console.log(err);
      msg.channel.send("```Something bad done happened :(```")
    }
    position.openprice = parseFloat(position.openprice);
    let priceDiff = currPrice - position.openprice;

    pgClient.query('UPDATE positions SET closeprice = $1, closedatetime = current_timestamp WHERE id = $2',
    [currPrice, position.id],
    (err, res) => {
      if (err) {
        console.log(err);
        msg.reply('```Sorry hun, there was a database error :(```');
      }
      else {
        position.closed = true;
        msg.reply('```diff' + `\nClosing ${position.ticker} ${position.position.toUpperCase()} at $${currPrice.toFixed(2)}\nOpened ${dateformat(position.opendatetime, "yyyy-mm-dd")} at $${position.openprice.toFixed(2)}\n${priceDiff >= 0 ? '+' : '-'} Realized PnL: $${priceDiff.toFixed(2)} (${(priceDiff / position.openprice * 100).toFixed(2)}%)` + '```');
      }
      pgClient.end();
    });
  }
  else {
    msg.reply('```Sorry hun, that position number doesn\'t exist, run \'!t p\' to see your open positions!```')
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

  // Store all the calculated information like price difference and price direction in a summary object so it doesn't
  // need to be re-calculated each time you turn the page in the table.
  const ITEMS_PER_PAGE = 5;
  const OPEN_POSITIONS = 'opened';
  const CLOSED_POSITIONS = 'closed';
  let res;
  let positionsSummary = {  // Object for to store positions
    openRows: [],           // Open positions
    closedRows: [],         // Closed positions
    openMaxPage: 0,
    closedMaxPage: 0,
    positionsType: OPEN_POSITIONS
  };
  try {
    res = await pgClient.query('SELECT * FROM positions WHERE discorduserid = $1 ORDER BY opendatetime', [discordUserId]);
    let openIndex = 0;              // Counter that we increment to give id's to open positions in order to reference for closing later
    res.rows.forEach(row => {
      if (row.closedatetime) {
        row.currPrice = parseFloat(row.closeprice);
      }
      else {
        row.posId = ++openIndex;    // This posId is only used for closing positions, so we only assign it if there ain't a close date
        let tokenData = tokenDataLookup[row.ticker];
        row.currPrice = tokenData.usd;
      }

      if (row.position.toUpperCase() === 'LONG') {
        row.priceDiff = row.currPrice - row.openprice;
      }
      else {
        row.priceDiff = row.openprice - row.currPrice;
      }
      
      row.priceDirection = row.priceDiff >= 0 ? '+' : '-';
    });
    positionsSummary.openRows = res.rows.filter(row => row.closedatetime === null);
    positionsSummary.closedRows = res.rows.filter(row => row.closedatetime !== null);
    positionsSummary.openMaxPage = Math.floor(positionsSummary.openRows.length/ITEMS_PER_PAGE) + ((positionsSummary.openRows.length % ITEMS_PER_PAGE == 0) ? 0 : 1);
    positionsSummary.closedMaxPage = Math.floor(positionsSummary.closedRows.length/ITEMS_PER_PAGE) + ((positionsSummary.closedRows.length % ITEMS_PER_PAGE == 0) ? 0 : 1);
    positionsCache[discordUserId] = positionsSummary.openRows;
  }
  catch (err) {
    console.log(err);
    msg.reply('```Sorry hun, there was a database error :(```');
  }

  let discordUserObj = await bot.users.fetch(discordUserId);

  /**
   * Builds a page for the positions table.
   * @param {number} pageNum Page number, should be 1 for the first call and then either increments or decrements depending on which way the user pages.
   * @returns {Object} Object that contains the text for the table and the maxPage so buildReactions() knows which paging reactions to show
  */
  let buildPositionsTable = (pageNum) => {
    const HORIZONTAL_DIVIDER = ' ';
    let tokenDataTable = ["```diff", `\n  #${HORIZONTAL_DIVIDER}    ticker${HORIZONTAL_DIVIDER}pos  ${HORIZONTAL_DIVIDER}          price`];

    const upperPageLimit = pageNum * ITEMS_PER_PAGE + 1;
    let maxPage = 0;
    let rowType = 'openRows';
    if (positionsSummary.positionsType === OPEN_POSITIONS) {
      maxPage = positionsSummary.openMaxPage;
    }
    else {
      maxPage = positionsSummary.closedMaxPage;
      rowType = 'closedRows';
    }

    // i is the starting index to display for positions
    // If pageNum is 1, then i = 1
    // If pageNum is 2, then i = 6, etc
    let i = (pageNum - 1) * ITEMS_PER_PAGE;
    for (let j in positionsSummary[rowType]) {  // j is the current row
      if (i === upperPageLimit) {               // If i === the upper page limit, break; Upper page limit is 6 if pageNum is 1, 11 if pageNum is 2 etc
        break;
      }
      if (j < i) {                              // If row < starting index then skip it
        continue;
      }
      else {
        let row = positionsSummary[rowType][j];

        // Create the table rows, e.g.:
        // --- ---------- ----- ---------------
        // -          BTC LONG  chg $     -2.87 
        // -   2020-05-13        o: $   8910.11 
        // -                     c: $   8907.24
        tokenDataTable.push(`\n---${HORIZONTAL_DIVIDER}----------${HORIZONTAL_DIVIDER}-----${HORIZONTAL_DIVIDER}---------------`);
        tokenDataTable.push(`\n${row.priceDirection}${utils.padString('  ', row.posId, true)}${HORIZONTAL_DIVIDER}${utils.padString('          ', row.ticker, true)}${HORIZONTAL_DIVIDER}${utils.padString('     ', row.position.toUpperCase(), false)}${HORIZONTAL_DIVIDER}chg $${utils.padString('           ', utils.padString('          ', row.priceDiff.toFixed(2), true), false)}`);
        tokenDataTable.push(`\n${row.priceDirection}  ${HORIZONTAL_DIVIDER}${utils.padString('          ', dateformat(row.opendatetime, "yyyy-mm-dd"), true)}${HORIZONTAL_DIVIDER}     ${HORIZONTAL_DIVIDER} o: $${utils.padString('           ', utils.padString('          ', parseFloat(row.openprice).toFixed(2), true), false)}`);
        tokenDataTable.push(`\n${row.priceDirection}  ${HORIZONTAL_DIVIDER}${utils.padString('          ', row.closedatetime ? dateformat(row.closedatetime, "yyyy-mm-dd") : '', true)}${HORIZONTAL_DIVIDER}     ${HORIZONTAL_DIVIDER} c: $${utils.padString('          ', utils.padString('          ', row.currPrice.toFixed(2), true), false)}`); // (${((priceDiff / row.openprice) * 100).toFixed(2)}%)`);
        i++;
      }
    }
    let positionTypeText = positionsSummary.positionsType === OPEN_POSITIONS ? '📖 Open Positions' : '📕 Closed Positions';
    tokenDataTable.push(`\n\n${utils.padString('                    ', positionTypeText, false)}${utils.padString('                ', 'Page ' + pageNum + '/' + maxPage, true)}`);
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
    let positionTypeReactPromise;
    if (positionsSummary.positionsType === OPEN_POSITIONS) {
      positionTypeReactPromise = sentEmbed.react('📕');
    }
    else {
      positionTypeReactPromise = sentEmbed.react('📖');
    }
    
    positionTypeReactPromise.then(() => {
      if (pageNum == 1) {                       // If it's the first page, 
        if (pageNum != maxPage) {               // and there're more pages, then only show 'Next Page' reactions.
          sentEmbed.react('▶')
            .then(() => sentEmbed.react('⏩'));
        }
      }
      else if (pageNum == maxPage) {            // If it's the last page, then only show the 'Previous Page' reactions.
        sentEmbed.react('⏪')
          .then(() => sentEmbed.react('◀'));
      }
      else {                                    // If it ain't the first or last page, show both typa reactions.
        sentEmbed.react('⏪')
          .then(() => sentEmbed.react('◀'))
          .then(() => sentEmbed.react('▶'))
          .then(() => sentEmbed.react('⏩'));
      }
    });
  }

  /**
   * Initializes the reactions, if applicable. Then set up a collector to listen for valid reactions.
   * @param {number} pageNum Page number, should be 1 for the first call and then either increments or decrements depending on which way the user pages.
   * @param {number} maxPage Max page number as determined by the number of positions and number of positions per page. Used in conjunction with the current pageNum to decide which paging reactions to show.
   * @param {Object} sentEmbed References the message that we should add our paging reactions to.
  */
  let buildReactionCollector = (pageNum, maxPage, sentEmbed) => {
    buildReactions(pageNum, maxPage, sentEmbed);
    // Only detect when the message author reacts with a valid reaction
    const filter = (reaction, user) => {
      return user.id === msg.author.id &&
        reaction.emoji.name === '▶' ||
        reaction.emoji.name === '⏩' ||
        reaction.emoji.name === '◀' ||
        reaction.emoji.name === '⏪' ||
        reaction.emoji.name === '📕' ||
        reaction.emoji.name === '📖';
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
          case '⏩':
            pageNum = maxPage;
            break;
          case '◀':
            pageNum--;
            break;
          case '⏪':
            pageNum = 1;
            break;
          case '📕':
            positionsSummary.positionsType = CLOSED_POSITIONS;
            pageNum = 1;
            break;
          case '📖':
            positionsSummary.positionsType = OPEN_POSITIONS;
            pageNum = 1;
            break
          default:
        }
        // Rebuild the positions table page with the new pageNum.
        let positionsTable = buildPositionsTable(pageNum);
        maxPage = positionsTable.maxPage;
        sentEmbed.edit(positionsTable.table);
        // Clear out the paging reactions if they exist
        sentEmbed.reactions.removeAll().catch(error => console.error('Failed to clear reactions: ', error))
        .then(() => {
          buildReactions(pageNum, maxPage, sentEmbed);
        });
      }
    });
    collector.on('end', collected => {
      // sentEmbed.reactions.removeAll().catch(error => console.error('Failed to clear reactions: ', error));
    });
  }

  // First call to build the positions table.
  // After this it's called recursively if the user changes pages.
  try {
    let positionsTable = buildPositionsTable(pageNum);
    let maxPage = positionsTable.maxPage;
    msg.reply(positionsTable.table)
      .then(sentEmbed => {
        buildReactionCollector(pageNum, maxPage, sentEmbed);
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