import { Global, Module } from '@nestjs/common';

import { OutboxPublisherService } from './outbox-publisher.service';

@Global()
@Module({
  providers: [OutboxPublisherService],
  exports: [OutboxPublisherService],
})
export class OutboxModule {}
