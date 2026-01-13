import * as DataLoader from 'dataloader'
import { Item } from './entities/item.entity'
import { ItemsService } from './items.service'

export type ItemsLoader = DataLoader<string, Item | null>

export const createItemsLoader = (
  itemsService: ItemsService,
  userId: string,
): ItemsLoader => {
  return new DataLoader<string, Item | null>(async (ids: string[]) => {
    // Buscamos todos los ítems de una vez
    const items = await itemsService.findBatchByIds(ids, userId)

    // Mapeamos para mantener el orden exacto de los IDs que entraron
    const itemsMap = new Map(items.map((item) => [item.id, item]))
    return ids.map((id) => itemsMap.get(id) || null)
  })
}
