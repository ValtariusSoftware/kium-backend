// src/users/entities/user.entity.ts (SOLUCIÓN)

import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm'
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql' // 💡 IMPORTAMOS registerEnumType
import { Item } from 'src/items/entities/item.entity'
import { Recipe } from 'src/recipes/entities/recipe.entity'
import { SyncEventEntity } from 'src/sync/entities/sync-event.entity'

// 1. Enum para el estado de la suscripción
export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED',
  NON_SUBSCRIBED = 'NON_SUBSCRIBED',
}

// 💡 REGISTRAR ENUM 1
registerEnumType(SubscriptionStatus, {
  name: 'SubscriptionStatus', // Nombre que se usará en el esquema GraphQL
  description: "The status of the user's subscription.",
})

// 2. Enum para el nivel de acceso (Solo FREE y planes futuros)
export enum AccessLevel {
  FREE = 'FREE',
  PRO = 'PRO',
}

// 💡 REGISTRAR ENUM 2
registerEnumType(AccessLevel, {
  name: 'AccessLevel', // Nombre que se usará en el esquema GraphQL
  description: 'The current access level of the user.',
})

@Entity({ name: 'users', schema: 'stock_control' })
@ObjectType()
export class User {
  @PrimaryColumn('varchar')
  @Field(() => ID)
  id: string

  @Column('varchar', { length: 100, unique: true })
  @Field()
  username: string

  @Column('varchar', { length: 255, unique: true })
  @Field()
  email: string

  // 💡 NUEVO CAMPO DE REFERIDOS
  @Column({
    name: 'referred_by_code',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  @Field({ nullable: true }) // Es nullable en GraphQL
  referredByCode?: string

  @Column({
    name: 'subscription_start_date',
    type: 'timestamp',
    nullable: true,
  })
  @Field({ nullable: true })
  subscriptionStartDate?: Date

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    enumName: 'subscriptionstatus', // Asegúrate que en Postgres sea así o 'subscription_status'
    name: 'subscription_status',
    default: SubscriptionStatus.NON_SUBSCRIBED,
  })
  @Field(() => SubscriptionStatus)
  subscriptionStatus: SubscriptionStatus

  @Column({
    type: 'enum',
    enum: AccessLevel,
    enumName: 'accesslevel', // Debe coincidir con el nombre del TYPE en Postgres
    name: 'access_level',
    default: AccessLevel.FREE,
  })
  @Field(() => AccessLevel)
  accessLevel: AccessLevel

  @Column('text', {
    array: true,
    default: '{}',
    name: 'fcm_tokens',
  })
  @Field(() => [String], { defaultValue: [] })
  fcmTokens: string[]

  // 💎 NUEVO CAMPO DE IDIOMA: Mapea con la columna que agrega la migración
  @Column('varchar', { length: 10, name: 'language', default: 'en' })
  @Field({ defaultValue: 'en' })
  language: string

  // 💡 CAMBIO CLAVE: Indicamos que la columna en la DB se llama 'created_at'
  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  @Field()
  createdAt: Date // Nombre de la propiedad en TypeScript (camelCase)

  // 💡 CAMBIO CLAVE: Indicamos que la columna en la DB se llama 'updated_at'
  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  @Field()
  updatedAt: Date // Nombre de la propiedad en TypeScript (camelCase)

  // 💡 AÑADIR ESTA RELACIÓN ONE-TO-MANY
  // Un Usuario puede tener muchos Items
  @OneToMany(() => Item, (item) => item.user)
  items: Item[] // Ahora la propiedad 'items' existe en User.

  @OneToMany(() => Recipe, (recipe) => recipe.user)
  recipes: Recipe[]

  @OneToMany(() => SyncEventEntity, (syncEvent) => syncEvent.user)
  syncEvents: SyncEventEntity[]
}
