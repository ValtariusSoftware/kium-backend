// src/users/entities/user.entity.ts (SOLUCIÓN)

import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql' // 💡 IMPORTAMOS registerEnumType

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
    name: 'subscription_status',
    type: 'varchar', // 💡 Mantenemos 'varchar' para evitar el crash del compilador
    length: 50,
    // Eliminamos la propiedad 'enum' de TypeORM aquí para evitar conflictos
    default: SubscriptionStatus.NON_SUBSCRIBED,
  })
  @Field(() => SubscriptionStatus)
  subscriptionStatus: SubscriptionStatus

  @Column({
    name: 'access_level',
    type: 'varchar', // 💡 Mantenemos 'varchar'
    length: 50,
    // Eliminamos la propiedad 'enum' de TypeORM aquí
    default: AccessLevel.FREE,
  })
  @Field(() => AccessLevel)
  accessLevel: AccessLevel

  // 💡 CAMBIO CLAVE: Indicamos que la columna en la DB se llama 'created_at'
  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  @Field()
  createdAt: Date // Nombre de la propiedad en TypeScript (camelCase)

  // 💡 CAMBIO CLAVE: Indicamos que la columna en la DB se llama 'updated_at'
  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  @Field()
  updatedAt: Date // Nombre de la propiedad en TypeScript (camelCase)
}
