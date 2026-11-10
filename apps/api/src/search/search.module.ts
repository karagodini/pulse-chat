import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [MessagesModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
