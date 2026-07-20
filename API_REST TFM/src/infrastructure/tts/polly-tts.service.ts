import { Injectable } from '@nestjs/common';
import { Engine, PollyClient, SynthesizeSpeechCommand, VoiceId } from '@aws-sdk/client-polly';

/**
 * Adaptador fino sobre Amazon Polly (docs/08-app-movil.md, botón "Escuchar al
 * DM"): convierte texto de la narración a un mp3. Sustituye a las voces
 * nativas del móvil (expo-speech), que sonaban "metálicas" — Polly ofrece
 * voces neuronales en español bastante más naturales (Lucia, es-ES).
 *
 * No es lógica de dominio (no hay reglas de negocio que testear con TDD
 * estricto, ver skill tdd-estricto): es un adaptador de infraestructura fino,
 * igual que los repositorios Mongoose.
 *
 * Requiere credenciales de AWS por variables de entorno — si faltan, el SDK
 * lanza su propio error al primer synthesize() (no se valida aquí a
 * propósito, para no duplicar la lógica de credenciales del SDK).
 */
@Injectable()
export class PollyTtsService {
  private readonly client: PollyClient;
  private readonly voiceId: VoiceId;
  private readonly engine: Engine;

  constructor() {
    this.client = new PollyClient({
      region: process.env.AWS_REGION ?? 'eu-west-1',
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined, // sin esto, el SDK cae a su cadena de credenciales por defecto (útil en AWS con un rol IAM)
    });
    this.voiceId = (process.env.POLLY_VOICE_ID as VoiceId) ?? 'Lucia';
    // 'standard' por defecto: el motor 'neural' no está habilitado en todas
    // las cuentas/regiones de AWS (aunque la voz Lucia lo soporte sobre el
    // papel) y Polly responde con ValidationException "This voice does not
    // support the selected engine" si no lo está en la región configurada.
    // 'standard' funciona en prácticamente cualquier región/cuenta. Si tu
    // cuenta sí tiene neural habilitado para es-ES, pon POLLY_ENGINE=neural
    // para una voz algo más natural.
    this.engine = (process.env.POLLY_ENGINE as Engine) ?? 'standard';
  }

  /** Sintetiza texto en español a un mp3 y devuelve los bytes crudos. */
  async synthesize(text: string): Promise<Buffer> {
    const command = new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: 'mp3',
      VoiceId: this.voiceId,
      Engine: this.engine,
      LanguageCode: 'es-ES',
    });

    const response = await this.client.send(command);
    if (!response.AudioStream) {
      throw new Error('Amazon Polly no devolvió audio (AudioStream vacío)');
    }

    const bytes = await response.AudioStream.transformToByteArray();
    return Buffer.from(bytes);
  }
}
