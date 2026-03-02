import {
  IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionType } from '@prisma/client';

export class CreateQuestionDto {
  @ApiProperty({ example: '2 + 2 неге тең?' })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ enum: QuestionType })
  @IsEnum(QuestionType)
  type: QuestionType;

  @ApiPropertyOptional({ example: ['2', '3', '4', '5'] })
  @IsOptional()
  options?: string[];

  @ApiProperty({ example: '4' })
  @IsString()
  @IsNotEmpty()
  answer: string;
}

export class CreateExamDto {
  @ApiProperty({ example: 'Математика финалдық емтиханы' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 60, description: 'Минуттармен' })
  @IsInt()
  @Min(1)
  duration: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  passScore?: number;

  @ApiProperty({ type: [CreateQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}
