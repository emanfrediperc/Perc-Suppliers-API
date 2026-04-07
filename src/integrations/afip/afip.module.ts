import { Module } from '@nestjs/common';
import { AfipService } from './afip.service';

@Module({
  providers: [AfipService],
  exports: [AfipService],
})
export class AfipModule {}
