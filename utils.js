'use strict'

module.exports = {
  padString: padString,
  parseDiscordUserId: parseDiscordUserId,
  toTitleCase: toTitleCase
}

/**
 * Pads a string with characters. Used mainly for keeping table columns aligned for price and position displays
 * e.g we want the price column to always be a consistent width 
 *    ticker | price        | 24hr % chg
 * +     XMR | $60.17       | 0.1
 * +     BTC | $8868.77     | 0.55
 * @param {string} pad String we're padding with, usually a number of spaces, e.g. '       '
 * @param {string} str String that we're padding e.g. '60.17'
 * @param {boolean} padLeft If true, then padding is on the left of the string, otherwise it's on the right
*/
function padString(pad, str, padLeft) {
  if (typeof str === 'undefined') 
    return pad;
  if (padLeft) {
    return (pad + str).slice(-pad.length);
  } else {
    return (str + pad).substring(0, pad.length);
  }
}

/**
 * See if a string matches a discord user identifier
 * @param {string} str String to check
*/
function parseDiscordUserId(str) {
  let pattern = /<@![0-9]+>/g;
  let matches = str.match(pattern);
  if (matches) {
    return matches[0].split('<@!').join('').split('>').join('');
  }
  else {
    return null;
  }
}

/**
 * Change a string to proper case, e.g. 'heya there' becomes 'Heya There'
 * @param {string} str String to check
*/
function toTitleCase(str) {
  return str.replace(
    /\w\S*/g,
    function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    }
  );
}