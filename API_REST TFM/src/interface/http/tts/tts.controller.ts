import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PollyTtsService } from '../../../infrastructure/tts/polly-tts.service';
import { SpeakDto } from './dto/speak.dto';

/**
 * Convierte texto a voz para el botón "Escuchar al DM" del móvil (ver
 * docs/08-app-movil.md). Requiere sesión (JwtAuthGuard) porque cada llamada
 * a Amazon Polly tiene coste — no se expone público. Devuelve el audio en
 * base64 dentro de JSON (en vez de un cuerpo binario) para reutilizar el
 * mismo cliente HTTP simple (JSON in/out) que ya usan mobile-app y ui-web.
 */
@UseGuards(JwtAuthGuard)
@Controller('tts')
export class TtsController {
  constructor(private readonly tts: PollyTtsService) {}

  @Post('speak')
  async speak(@Body() dto: SpeakDto): Promise<{ audioBase64: string }> {
    const audio = await this.tts.synthesize(dto.text);
    return { audioBase64: audio.toString('base64') };
  }
}
