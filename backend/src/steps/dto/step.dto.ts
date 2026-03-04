import { IsNotEmpty, IsString, IsInt, IsOptional, IsEnum, IsObject, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { StepType } from '@prisma/client';

export class CreateStepDto {
  @ApiProperty({ enum: StepType })
  @IsEnum(StepType)
  type: StepType;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order: number;

  @ApiProperty({
    example: { question: 'Сұрақ', taskType: 'single_choice', options: ['A', 'B'], correctAnswer: 'A' },
  })
  @IsObject()
  content: Record<string, any>;
}

export class UpdateStepDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  content?: Record<string, any>;

  @ApiPropertyOptional({ enum: StepType })
  @IsOptional()
  @IsEnum(StepType)
  type?: StepType;
}

export class SubmitAnswerDto {
  @ApiProperty({ example: { selected: 'A' } })
  @IsObject()
  answer: Record<string, any>;
}
