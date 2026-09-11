import { Injectable } from '@nestjs/common';

/**
 * Adaptador fino sobre Qwen3-TTS-Flash (Alibaba Cloud Model Studio /
 * DashScope), para el botón "Escuchar al DM" (ver docs/08-app-movil.md).
 * Sustituye a Amazon Polly (ver historial de polly-tts.service.ts) -- mismo
 * contrato (synthesize(text) -> Buffer de audio), así que TtsController no
 * cambia salvo el nombre de la clase inyectada.
 *
 * No es lógica de dominio (no hay reglas de negocio que testear con TDD
 * estricto, ver skill tdd-estricto): es un adaptador de infraestructura fino,
 * igual que polly-tts.service.ts antes o los repositorios Mongoose.
 *
 * Diferencia clave con Polly: la API de síntesis (no-streaming) de Qwen-TTS
 * NO devuelve los bytes de audio en la propia respuesta -- devuelve una URL
 * (output.audio.url) válida 24h de la que hay que descargar el mp3/wav aparte
 * (ver "Non-real-time speech synthesis" en la doc de Alibaba Cloud Model
 * Studio). Por eso synthesize() hace dos peticiones: una a
 * multimodal-generation/generation para pedir la síntesis, y otra a la URL
 * devuelta para bajarse el audio ya generado.
 *
 * Requiere QWEN_TTS_API_KEY por variable de entorno (API key de Alibaba
 * Cloud Model Studio, región Singapur por defecto -- ver README para el
 * proceso completo de alta/recarga de saldo). Si falta, se lanza un error
 * explícito en el primer synthesize() en vez de fallar más adelante con un
 * 401 críptico de DashScope.
 *
 * Voz clonada (opcional): si QWEN_TTS_CLONED_VOICE_ID está puesta en .env
 * (el id que devuelve `npm run clone-voice`, ver scripts/clone-voice.ts),
 * esa voz se usa como voz por defecto en vez de QWEN_TTS_VOICE (Bodega).
 * Las voces clonadas NO funcionan con qwen3-tts-flash -- Qwen exige un
 * modelo VC (voice-cloning) dedicado para sintetizar con ellas, así que
 * synthesize() cambia de modelo automáticamente en cuanto la voz efectiva
 * (voiceOverride o la de por defecto) coincide con la voz clonada. Con
 * QWEN_TTS_CLONED_VOICE_ID vacía, el comportamiento es exactamente el de
 * antes (siempre qwen3-tts-flash + voz de catálogo).
 */
@Injectable()
export class QwenTtsService {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly voice: string;
  private readonly languageType: string;
  private readonly clonedVoiceId: string | undefined;
  private readonly vcModel: string;

  constructor() {
    this.apiKey = process.env.QWEN_TTS_API_KEY;
    // Singapur (internacional) por defecto -- si tu cuenta/API key es de la
    // región Pekín (cuenta china), pon QWEN_TTS_BASE_URL=https://dashscope.aliyuncs.com/api/v1
    // (las API keys de cada región son distintas entre sí y no son intercambiables).
    this.baseUrl = process.env.QWEN_TTS_BASE_URL ?? 'https://dashscope-intl.aliyuncs.com/api/v1';
    this.model = process.env.QWEN_TTS_MODEL ?? 'qwen3-tts-flash';
    this.clonedVoiceId = process.env.QWEN_TTS_CLONED_VOICE_ID;
    // Tiene que ser el MISMO target_model que se usó al crear la voz con
    // clone-voice.ts, o la síntesis falla -- ver comentario del script.
    this.vcModel = process.env.QWEN_TTS_VC_MODEL ?? 'qwen3-tts-vc-2026-01-22';
    // Si hay voz clonada configurada, es la que se usa por defecto (para eso
    // se creó); si no, cae en 'Bodega'. 'Bodega' es la ÚNICA voz del
    // catálogo descrita explícitamente como española de España ("a
    // passionate Spanish man") -- el resto son multilingües pero con acento
    // por defecto latinoamericano (ej. 'Sonrisa', "Latin American woman") o
    // neutro/sin acento marcado (ej. 'Bellona', que sonaba con acento
    // sudamericano en la práctica pese a no tener ninguna nacionalidad
    // indicada en su descripción oficial). Ver catálogo completo (con audio
    // de muestra por voz) en
    // https://www.alibabacloud.com/help/en/model-studio/qwen-tts-voice-list
    // OJO orden: la voz clonada gana sobre QWEN_TTS_VOICE, no al revés -- si
    // QWEN_TTS_VOICE se quedó puesta a 'Bodega' de antes (como en Render, al
    // migrar de Polly), ?? nunca la "salta" porque una cadena no vacía no es
    // null/undefined. Sin este orden, activar la voz clonada solo con
    // QWEN_TTS_CLONED_VOICE_ID no tenía ningún efecto mientras
    // QWEN_TTS_VOICE siguiera presente -- justo el bug reportado en producción.
    this.voice = this.clonedVoiceId ?? process.env.QWEN_TTS_VOICE ?? 'Bodega';
    this.languageType = process.env.QWEN_TTS_LANGUAGE ?? 'Spanish';
  }

  /**
   * Sintetiza texto en español a un audio y devuelve los bytes crudos.
   * `voiceOverride` permite probar otra voz (del catálogo o clonada)
   * puntualmente (ver SpeakDto.voice) sin tocar QWEN_TTS_VOICE ni redeployar.
   */
  async synthesize(text: string, voiceOverride?: string): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error(
        'Falta QWEN_TTS_API_KEY: crea una API key en Alibaba Cloud Model Studio ' +
          '(consola, región Singapur) y añádela al .env. Ver README para el proceso completo.',
      );
    }

    const effectiveVoice = voiceOverride ?? this.voice;
    // La voz clonada exige el modelo VC dedicado; cualquier otra voz (de
    // catálogo) sigue usando el modelo normal (qwen3-tts-flash por defecto).
    const effectiveModel = this.clonedVoiceId && effectiveVoice === this.clonedVoiceId ? this.vcModel : this.model;

    const synthesisResponse = await fetch(`${this.baseUrl}/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: effectiveModel,
        input: {
          text,
          voice: effectiveVoice,
          language_type: this.languageType,
        },
      }),
    });

    const body: unknown = await synthesisResponse.json().catch(() => null);

    if (!synthesisResponse.ok) {
      const errBody = (body ?? {}) as { message?: string; code?: string };
      throw new Error(
        `Qwen-TTS no pudo sintetizar el audio (HTTP ${synthesisResponse.status}): ` +
          (errBody.message ?? errBody.code ?? 'sin detalle en la respuesta'),
      );
    }

    const audioUrl = (body as { output?: { audio?: { url?: string } } } | null)?.output?.audio?.url;
    if (!audioUrl) {
      throw new Error(
        `Qwen-TTS respondió sin URL de audio (output.audio.url ausente): ${JSON.stringify(body)}`,
      );
    }

    // La URL solo vive 24h y son bytes ya generados -- una segunda petición
    // simple, sin autenticación (no es una API de DashScope, es un blob).
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`No se pudo descargar el audio generado por Qwen-TTS (HTTP ${audioResponse.status})`);
    }

    const arrayBuffer = await audioResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
