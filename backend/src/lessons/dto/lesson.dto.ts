import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLessonDto {
  @ApiProperty({ example: '1-сабақ: Кіріспе' })
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

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  order: number;
}
