import { ApolloDriverConfig } from '@nestjs/apollo'
import { join } from 'path'
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default'
import { ConfigService } from '@nestjs/config'
import { RecipesService } from '../recipes/recipes.service' // <--- Importante
import { createRecipesLoader } from '../recipes/recipes.loader' // <--- El archivo que vamos a crear
import { createItemsLoader } from 'src/items/items.loader'
import { ItemsService } from 'src/items/items.service'

export const graphqlConfig = (
  configService: ConfigService,
  recipesService: RecipesService,
  itemsService: ItemsService,
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
  context: ({ req, res }: { req: Request; res: Response }) => {
    const userId = req['user']?.id

    return {
      req,
      res,
      // Solo creamos el loader si hay un usuario autenticado
      recipesLoader: userId
        ? createRecipesLoader(recipesService, userId)
        : null,
      itemsLoader: userId ? createItemsLoader(itemsService, userId) : null,
    }
  },
})
