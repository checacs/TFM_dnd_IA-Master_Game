import { Module } from '@nestjs/common';
import { PersistenceModule } from './persistence.module';
import { GamesModule } from './games.module';
import { CharactersModule } from './characters.module';
import { AuthModule } from './auth.module';
import { TtsModule } from './tts.module';

@Module({
  imports: [PersistenceModule, AuthModule, GamesModule, CharactersModule, TtsModule],
})
export class AppModule {}
