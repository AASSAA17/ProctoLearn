import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { MAX_EXAM_QUESTIONS } from '../../exams/question-limit';

export class AnswerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  questionId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  answer: string;
}

export class SubmitAnswersDto {
  @ApiProperty({ type: [AnswerDto] })
  @IsArray()
  @ArrayMaxSize(MAX_EXAM_QUESTIONS)
  @ArrayUnique((answer: AnswerDto) => answer?.questionId)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}

export class SaveDraftDto extends SubmitAnswersDto {
  @ApiProperty({ description: 'Revision returned by the last successful draft read/write' })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  revision: number;
}
