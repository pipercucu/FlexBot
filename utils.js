'use strict'

module.exports = {
  padString: padString,
  parseDiscordUserId: parseDiscordUserId,
  toTitleCase: toTitleCase
}

function padString(pad, str, padLeft) {
  if (typeof str === 'undefined') 
    return pad;
  if (padLeft) {
    return (pad + str).slice(-pad.length);
  } else {
    return (str + pad).substring(0, pad.length);
  }
}

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

function toTitleCase(str) {
  return str.replace(
    /\w\S*/g,
    function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    }
  );
}