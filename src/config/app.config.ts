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
  corsOrigin:
    process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000',
  graphqlSchema: process.env.GRAPHQL_SCHEMA,
  nextAuthSecret: process.env.NEXTAUTH_SECRET,
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'SECRET',
    refreshSecret: process.env.JWT_JWT_REFRESH_SECRET || 'REFRESH_SECRET',
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '1h',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },
})
