import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLessonDto {
  @ApiProperty({ example: '1-сабақ: Кіріспе' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Сабақтың мазмұны...' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  order: number;
}
