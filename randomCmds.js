'use strict'
const coinGeckoCmds = require('./coinGeckoCmds.js');
const soupsList = require('./common/soupsList.json');

module.exports = {
  random: random
}

async function random(msg, args, bot) {
  const discordUserId = msg.author.id;
  const helpEmbed = {
    title: 'Random Commands',
    fields: [
      { name: 'Asphy', value: 'To see how much asphy\'s stack would\'ve been worth if he weren\'t liquidated, use: ```!random asphy\n!r asphy```' },
      { name: 'Soups', value: 'Soup for you: ```!random soup\n!r soup```' }
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
      msg.channel.send('```' + `Asphy woulda had ${tokenData.usd * 4800} stinkin dollars if he weren't liquidated.` + '```');
      break;
    case 'soup':
      msg.channel.send('```' + `${soupsList.length} soups.` + '```')
      const randomSoup = soupsList[Math.floor(Math.random() * soupsList.length)];
      const soupEmbed = {
        title: randomSoup.name || 'N/A',
        fields: [
          { name: 'Origin', value: randomSoup.origin || 'N/A' },
          { name: 'Type', value: randomSoup.type || 'N/A' },
          { name: 'Description', value: randomSoup.description || 'N/A' }
        ]
      }
      msg.channel.send({ embed: soupEmbed });
      break;
    default:
      msg.reply({ embed: helpEmbed });
  }
}