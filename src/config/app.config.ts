export default () => ({
  port: Number(process.env.PORT),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    pass: process.env.DB_PASS || '',
    name: process.env.DB_NAME || '',
    schema: process.env.DB_SCHEMA || 'public',
  },
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  graphqlSchema: process.env.GRAPHQL_SCHEMA,
  nextAuthSecret: process.env.NEXTAUTH_SECRET,
})
