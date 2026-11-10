import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateInviteDto, CreateWorkspaceDto } from './dto';
import { WorkspacesService } from './workspaces.service';

@Controller()
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get('workspaces')
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.list(user.id);
  }

  @Post('workspaces')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.id, dto);
  }

  @Get('workspaces/:workspaceId/members')
  members(@CurrentUser() user: AuthUser, @Param('workspaceId') workspaceId: string) {
    return this.workspaces.members(user.id, workspaceId);
  }

  @Post('workspaces/:workspaceId/invites')
  invite(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.workspaces.invite(user.id, workspaceId, dto);
  }

  @Post('invites/:token/accept')
  accept(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.workspaces.acceptInvite(user.id, token);
  }
}
