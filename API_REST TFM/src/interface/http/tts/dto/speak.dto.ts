import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SpeakDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  text!: string;

  /**
   * Sobrescribe la voz por defecto (QWEN_TTS_VOICE) para esta llamada
   * concreta -- pensado para probar voces del catálogo de Qwen sin tener
   * que cambiar la variable de entorno y redeployar cada vez (ver
   * https://www.alibabacloud.com/help/en/model-studio/qwen-tts-voice-list).
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  voice?: string;
}
