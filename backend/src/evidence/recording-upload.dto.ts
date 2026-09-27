import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateRecordingUploadDto {
  @IsIn(['camera', 'screen'])
  kind: 'camera' | 'screen';

  @IsUUID('4')
  clientSessionId: string;

  @IsString()
  @MaxLength(128)
  mimeType: string;
}

export class CompleteRecordingUploadDto {
  @IsInt()
  @Min(1)
  @Max(8192)
  expectedChunks: number;

  @IsOptional()
  @IsBoolean()
  interrupted?: boolean;
}
