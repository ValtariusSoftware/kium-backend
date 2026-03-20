import { InputType, Field, Int } from '@nestjs/graphql'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

@InputType()
export class PaginationInput {
  // Definimos constantes estáticas para que sean accesibles desde cualquier lado
  static readonly DEFAULT_LIMIT = 50
  static readonly DEFAULT_OFFSET = 0

  @Field(() => Int, {
    defaultValue: PaginationInput.DEFAULT_LIMIT,
    nullable: true,
  })
  @IsInt()
  @Min(1)
  @Max(500) // 👈 Límite de seguridad para que nadie rompa la DB pidiendo 10.000
  @IsOptional()
  limit: number = PaginationInput.DEFAULT_LIMIT

  @Field(() => Int, {
    defaultValue: PaginationInput.DEFAULT_OFFSET,
    nullable: true,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  offset: number = PaginationInput.DEFAULT_OFFSET
}
