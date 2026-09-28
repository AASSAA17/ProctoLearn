import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateLessonDto {
  @ApiProperty({ example: '1-сабақ: Кіріспе' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Сабақтың мазмұны...' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ example: 'https://www.youtube.com/embed/VIDEO_ID' })
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional({ example: 'Тапсырма: ...' })
  @IsOptional()
  @IsString()
  assignment?: string;

  @ApiPropertyOptional({ description: 'Server-side grading answer, visible only to the course author and administrators' })
  @IsOptional()
  @IsString()
  assignmentAnswer?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  order: number;
}

export class UpdateLessonDto extends PartialType(CreateLessonDto) {}
