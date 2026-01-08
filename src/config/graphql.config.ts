import { ApolloDriverConfig } from '@nestjs/apollo'
import { join } from 'path'
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default'
import { ConfigService } from '@nestjs/config'
import { RecipesService } from '../recipes/recipes.service' // <--- Importante
import { createRecipesLoader } from '../recipes/recipes.loader' // <--- El archivo que vamos a crear

export const graphqlConfig = (
  configService: ConfigService,
  recipesService: RecipesService,
): ApolloDriverConfig => ({
  autoSchemaFile: join(
    process.cwd(),
    configService.get<string>('graphqlSchema', 'src/schema.gql'),
  ),
  playground: false,
  introspection: true,
  plugins: [
    // ApolloServerPluginLandingPageLocalDefault()
    ApolloServerPluginLandingPageLocalDefault({
      embed: true,
      includeCookies: true,
    }),
  ],
  context: ({ req, res }: { req: Request; res: Response }) => ({
    req,
    res,
    recipesLoader: createRecipesLoader(recipesService),
  }),
})
