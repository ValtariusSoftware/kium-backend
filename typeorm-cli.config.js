const { DataSource } = require('typeorm')
const dotenv = require('dotenv')
dotenv.config()

module.exports = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  schema: process.env.DB_SCHEMA,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/*.js'],
})
