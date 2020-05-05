# FlexBot
Discord bot for pulling cryptocurrency price data and logging trading positions

## Dependencies
1. Install Node.js version 12 or greater
2. Install and run PostgreSQL

## Setup
1. Run `npm install` to install all the node dependencies
2. Create and populate auth.json (auth.json.template provided)
3. Run `node dbCmds.js` to create a positions table in your database
4. Run `node coinGeckoCmds.js loadLookupJson` to populate a lookup hash for parsing CoinGecko calls

## Run
`nodemon --inspect index.js`