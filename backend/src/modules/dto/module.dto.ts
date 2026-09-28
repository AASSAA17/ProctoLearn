import { IsNotEmpty, IsString, IsInt, IsOptional, Min, IsArray, ArrayMinSize, ArrayMaxSize, ArrayUnique, ValidateNested, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class CreateModuleDto {
  @ApiProperty({ example: '1-тарау: Алгебра негіздері' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order: number;
}

export class UpdateModuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order?: number;
}

export class ReorderModuleItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id: string;

  @IsInt()
  @Min(1)
  order: number;
}

export class ReorderModuleDto {
  @ApiProperty({ example: [{ id: 'uuid', order: 1 }] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((item: ReorderModuleItemDto) => item?.id)
  @ValidateNested({ each: true })
  @Type(() => ReorderModuleItemDto)
  items: ReorderModuleItemDto[];
}
