import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ChannelsService } from './channels.service';
import { AddMemberDto, CreateChannelDto, OpenDirectDto } from './dto';

@Controller()
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get('workspaces/:workspaceId/channels')
  list(@CurrentUser() user: AuthUser, @Param('workspaceId') workspaceId: string) {
    return this.channels.list(user.id, workspaceId);
  }

  @Post('workspaces/:workspaceId/channels')
  create(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.channels.create(user.id, workspaceId, dto);
  }

  @Post('workspaces/:workspaceId/conversations')
  openDirect(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: OpenDirectDto,
  ) {
    return this.channels.openDirect(user.id, workspaceId, dto.userId);
  }

  @Post('channels/:channelId/members')
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('channelId') channelId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.channels.addMember(user.id, channelId, dto);
  }

  @Post('channels/:channelId/read')
  markRead(@CurrentUser() user: AuthUser, @Param('channelId') channelId: string) {
    return this.channels.markRead(user.id, channelId);
  }
}
