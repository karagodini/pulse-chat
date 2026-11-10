import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateChannelDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9][a-z0-9-]{1,40}$/)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  topic?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}

export class OpenDirectDto {
  @IsString()
  userId!: string;
}

export class AddMemberDto {
  @IsString()
  userId!: string;
}
