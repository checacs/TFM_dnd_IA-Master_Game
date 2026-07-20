import { Module } from '@nestjs/common';
import { TtsController } from '../interface/http/tts/tts.controller';
import { PollyTtsService } from '../infrastructure/tts/polly-tts.service';

@Module({
  controllers: [TtsController],
  providers: [PollyTtsService],
})
export class TtsModule {}
