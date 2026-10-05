import { BadRequestException } from '@nestjs/common';

export const MAX_EXAM_QUESTIONS = 1000;

export function assertQuestionLimit(count: number) {
  if (count > MAX_EXAM_QUESTIONS) {
    throw new BadRequestException({
      code: 'EXAM_QUESTION_LIMIT',
      message: `Емтиханда ең көбі ${MAX_EXAM_QUESTIONS} сұрақ болуы мүмкін. Оқытушыдан артық сұрақтарды алып тастауды сұраңыз`,
    });
  }
}
