import { Body, Controller, Patch } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { toSessionUser } from '../common/public-user';
import { PrismaService } from '../prisma/prisma.service';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  statusText?: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch('me')
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        name: dto.name?.trim(),
        title: dto.title?.trim(),
        statusText: dto.statusText?.trim(),
      },
    });
    return toSessionUser(updated);
  }
}
