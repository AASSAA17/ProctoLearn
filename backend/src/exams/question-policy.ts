import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';

export interface QuestionInput {
  text: string;
  type: QuestionType;
  options?: string[] | null;
  answer: string;
}

export function validatedQuestion(input: QuestionInput) {
  const text = input.text?.trim();
  const answer = input.answer?.trim();
  if (!text || !answer) throw new BadRequestException('Сұрақ пен дұрыс жауап бос болмауы керек');
  if (input.type === QuestionType.TEXT) return { text, type: input.type, options: [], answer };
  if (input.type !== QuestionType.SINGLE_CHOICE && input.type !== QuestionType.MULTIPLE_CHOICE) {
    throw new BadRequestException('Сұрақ түрі дұрыс емес');
  }
  const options = input.options?.map(value => value.trim()) ?? [];
  if (options.length < 2 || options.some(value => !value) ||
      new Set(options.map(value => value.toLowerCase())).size !== options.length) {
    throw new BadRequestException('Кемінде екі бос емес, қайталанбайтын нұсқа керек');
  }
  if (input.type === QuestionType.SINGLE_CHOICE) {
    if (!options.includes(answer)) throw new BadRequestException('Дұрыс жауап нұсқалардың бірі болуы керек');
    return { text, type: input.type, options, answer };
  }
  let selected: string[];
  try {
    const parsed: unknown = JSON.parse(answer);
    selected = Array.isArray(parsed) && parsed.every(value => typeof value === 'string') ? parsed : [];
  } catch {
    // Existing exam fixtures use comma-separated answer keys.
    selected = options.includes(answer) ? [answer] : answer.split(',');
  }
  selected = selected.map(value => value.trim());
  if (!selected.length || new Set(selected).size !== selected.length || selected.some(value => !options.includes(value))) {
    throw new BadRequestException('Дұрыс жауаптар нұсқаларға сәйкес болуы керек');
  }
  return { text, type: input.type, options, answer: JSON.stringify(selected) };
}
