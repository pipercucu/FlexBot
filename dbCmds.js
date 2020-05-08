'use strict'
const auth = require('./auth.json');
const pg = require('pg');

module.exports = {
  createTables: createTables,
  getPgClient: getPgClient
}

function createTables() {
  const pgClient = getPgClient();
  pgClient.connect();
  
  const tableName = "positions";
  
  const createTableSql = `CREATE TABLE ${tableName} (
  id SERIAL NOT NULL,
  discordUserId VARCHAR(255) NOT NULL,
  ticker VARCHAR(255) NOT NULL,
  position VARCHAR(255) NOT NULL,
  openprice DECIMAL NOT NULL,
  closeprice DECIMAL,
  opendatetime TIMESTAMP NOT NULL,
  closedatetime TIMESTAMP
  );`;
  
  pgClient.query(createTableSql, [], (err, res) => {
    pgClient.end();
  });
}

function getPgClient() {
  return new pg.Client({
    user: auth.pgConfig.user,
    host: auth.pgConfig.host,
    database: auth.pgConfig.database,
    password: auth.pgConfig.password,
    port: auth.pgConfig.port
  });
}

require('make-runnable');