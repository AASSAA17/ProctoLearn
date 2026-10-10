import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsString, Matches, ValidateNested } from 'class-validator';
import { CreateCourseDto } from '../courses/dto/course.dto';
import { CreateModuleDto } from '../modules/dto/module.dto';
import { CreateLessonDto } from '../lessons/dto/lesson.dto';
import { CreateStepDto } from '../steps/dto/step.dto';
import { CreateExamDto } from '../exams/dto/exam.dto';

export class ImportLessonDto extends CreateLessonDto {
  @IsArray() @ArrayMinSize(4) @ArrayMaxSize(4)
  @ValidateNested({ each: true }) @Type(() => CreateStepDto)
  steps: CreateStepDto[];
}
export class ImportModuleDto extends CreateModuleDto {
  @IsArray() @ArrayMinSize(3) @ArrayMaxSize(3)
  @ValidateNested({ each: true }) @Type(() => ImportLessonDto)
  lessons: ImportLessonDto[];
}
export class ImportCourseDto extends CreateCourseDto {
  @IsArray() @ArrayMinSize(3) @ArrayMaxSize(4)
  @ValidateNested({ each: true }) @Type(() => ImportModuleDto)
  modules: ImportModuleDto[];
  @IsDefined() @ValidateNested() @Type(() => CreateExamDto)
  exam: CreateExamDto;
}
export class ImportDraftDto {
  @IsString() @Matches(/^pilot-curriculum-v1:C(?:0[1-9]|1[0-5])$/)
  authoringKey: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/)
  revisionHash: string;
  @IsDefined() @ValidateNested() @Type(() => ImportCourseDto)
  course: ImportCourseDto;
}
