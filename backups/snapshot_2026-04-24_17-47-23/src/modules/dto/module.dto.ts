import { IsNotEmpty, IsString, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateModuleDto {
  @ApiProperty({ example: '1-тарау: Алгебра негіздері' })
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
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order?: number;
}

export class ReorderModuleDto {
  @ApiProperty({ example: [{ id: 'uuid', order: 1 }] })
  items: { id: string; order: number }[];
}
