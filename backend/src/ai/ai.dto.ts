import { IsString, IsOptional, MaxLength, IsArray } from 'class-validator';

export class ChatMessageDto {
  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsArray()
  history?: { role: 'user' | 'assistant'; content: string }[];
}
