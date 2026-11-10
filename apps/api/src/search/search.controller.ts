import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { SearchService } from './search.service';

@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('workspaces/:workspaceId/search')
  run(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Query('q') q?: string,
  ) {
    return this.search.search(user.id, workspaceId, q);
  }
}
