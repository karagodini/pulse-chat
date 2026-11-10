import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentIds?: string[];
}

export class UpdateMessageDto {
  @IsString()
  @MaxLength(4000)
  body!: string;
}

export class ReactDto {
  @IsString()
  @MaxLength(8)
  emoji!: string;
}
