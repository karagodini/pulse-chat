import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateMessageDto, ReactDto, UpdateMessageDto } from './dto';
import { MessagesService } from './messages.service';

@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('channels/:channelId/messages')
  list(
    @CurrentUser() user: AuthUser,
    @Param('channelId') channelId: string,
    @Query('cursor') cursor?: string,
    @Query('parentId') parentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messages.list(user.id, channelId, cursor, parentId, limit);
  }

  @Post('channels/:channelId/messages')
  create(
    @CurrentUser() user: AuthUser,
    @Param('channelId') channelId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messages.create(user.id, channelId, dto);
  }

  @Get('messages/:messageId')
  get(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string) {
    return this.messages.get(user.id, messageId);
  }

  @Patch('messages/:messageId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messages.update(user.id, messageId, dto);
  }

  @Delete('messages/:messageId')
  remove(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string) {
    return this.messages.remove(user.id, messageId);
  }

  @Post('messages/:messageId/reactions')
  react(
    @CurrentUser() user: AuthUser,
    @Param('messageId') messageId: string,
    @Body() dto: ReactDto,
  ) {
    return this.messages.react(user.id, messageId, dto.emoji);
  }
}
