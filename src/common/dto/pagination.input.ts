import { InputType, Field, Int } from '@nestjs/graphql'
import { IsInt, IsOptional, Min } from 'class-validator'

@InputType()
export class PaginationInput {
  @Field(() => Int, { defaultValue: 6, nullable: true }) // Agregá nullable: true acá
  @IsInt()
  @Min(1)
  @IsOptional()
  limit: number = 6

  @Field(() => Int, { defaultValue: 0, nullable: true }) // Agregá nullable: true acá
  @IsInt()
  @Min(0)
  @IsOptional()
  offset: number = 0
}
