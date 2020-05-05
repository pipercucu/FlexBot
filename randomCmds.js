'use strict'
const auth = require('./auth.json');
const fs = require('fs');
const coinGeckoCmds = require('./coinGeckoCmds.js');
const coinGeckoLookups = require('./common/coinGeckoLookups.json')
const CoinGecko = require('coingecko-api');
const pg = require('pg');
const soupsList = require('./common/soupsList.json');
const utils = require('./utils.js');

const CoinGeckoClient = new CoinGecko();

module.exports = {
  random: random
}

async function random(msg, args, bot) {
  const discordUserId = msg.author.id;
  const helpEmbed = {
    title: 'Random Commands',
    fields: [
      { name: 'Asphy', value: 'Use `!random asphy` or `!r asphy` to see how much asphy\'s stack would\'ve been worth if he weren\'t liquidated.' },
      { name: 'Soups', value: 'Use `!random soup` or `!r soup` and soup for you.' }
    ]
  }
  
  if (args.length === 1) {
    msg.reply({ embed: helpEmbed });
    return;
  }

  const cmd = args[1].toLowerCase();

  switch (cmd) {
    case 'asphy':
      let data = await coinGeckoCmds.getPrice(['ETH']);
      let tokenDataKeys = Object.keys(data.found);
      let tokenData = data.found[tokenDataKeys];
      msg.channel.send('```' + `${tokenData.usd * 3000} stinkin dollars.` + '```');
      break;
    case 'soup':
      msg.channel.send('```' + `${soupsList.length} soups.` + '```')
      const randomSoup = soupsList[Math.floor(Math.random() * soupsList.length)];
      const soupEmbed = {
        title: randomSoup.name,
        fields: [
          { name: 'Origin', value: randomSoup.origin },
          { name: 'Type', value: randomSoup.type },
          { name: 'Description', value: randomSoup.description }
        ]
      }
      msg.channel.send({ embed: soupEmbed });
      break;
    default:
      msg.reply({ embed: helpEmbed });
  }
}