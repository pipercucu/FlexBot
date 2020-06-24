'use strict'

module.exports = {
  react: react
}

async function react(msg) {
  if (msg.content.toLowerCase().includes('corn')) {
    msg.react('🌽');
  }
  if (msg.content.toLowerCase().includes('lmao')) {
    msg.react('🇱')
      .then(() => msg.react('🇲'))
      .then(() => msg.react('🇦'))
      .then(() => msg.react('🇴'))
      .then(() => msg.react('😆'));
  }
  else if (msg.content.toLowerCase().includes('rofl')) {
    msg.react('🇷')
      .then(() => msg.react('🇴'))
      .then(() => msg.react('🇫'))
      .then(() => msg.react('🇱'))
      .then(() => msg.react('🤣'));
  }
  else if (msg.content.toLowerCase().includes('soup')) {
    msg.react('🇸')
      .then(() => msg.react('🇴'))
      .then(() => msg.react('🇺'))
      .then(() => msg.react('🇵'))
      .then(() => msg.react('🥣'));
  }
  else if (msg.content === 'tf' || msg.content.toLowerCase().includes('wtf')) {
    msg.react('🇼')
      .then(() => msg.react('🇹'))
      .then(() => msg.react('🇫'));
  }
}