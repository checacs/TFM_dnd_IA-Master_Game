import { Module } from '@nestjs/common';
import { TtsController } from '../interface/http/tts/tts.controller';
import { QwenTtsService } from '../infrastructure/tts/qwen-tts.service';

@Module({
  controllers: [TtsController],
  providers: [QwenTtsService],
})
export class TtsModule {}
