'use strict'
const auth = require('./auth.json');
const pg = require('pg');

const pgClient = new pg.Client({
  user: auth.pgConfig.user,
  host: auth.pgConfig.host,
  database: auth.pgConfig.database,
  password: auth.pgConfig.password,
  port: auth.pgConfig.port
});
pgClient.connect();

const tableName = "positions";

const createTableSql = `CREATE TABLE ${tableName} (
id SERIAL NOT NULL,
discordUserId VARCHAR(255) NOT NULL,
ticker VARCHAR(255) NOT NULL,
position VARCHAR(255) NOT NULL,
price DECIMAL NOT NULL,
datetime TIMESTAMP NOT NULL
);`;

pgClient.query(createTableSql, [], (err, res) => {
  pgClient.end();
});