import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { WorkspaceRole } from '@pulse/shared';

export class CreateWorkspaceDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;
}

export class CreateInviteDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(['ADMIN', 'MEMBER'])
  role?: Exclude<WorkspaceRole, 'OWNER'>;
}
