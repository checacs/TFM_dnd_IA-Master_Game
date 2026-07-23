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
 */
@Injectable()
export class QwenTtsService {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly voice: string;
  private readonly languageType: string;

  constructor() {
    this.apiKey = process.env.QWEN_TTS_API_KEY;
    // Singapur (internacional) por defecto -- si tu cuenta/API key es de la
    // región Pekín (cuenta china), pon QWEN_TTS_BASE_URL=https://dashscope.aliyuncs.com/api/v1
    // (las API keys de cada región son distintas entre sí y no son intercambiables).
    this.baseUrl = process.env.QWEN_TTS_BASE_URL ?? 'https://dashscope-intl.aliyuncs.com/api/v1';
    this.model = process.env.QWEN_TTS_MODEL ?? 'qwen3-tts-flash';
    // 'Bellona': "voz potente y clara que da vida a los personajes... con
    // grandeza heroica" (descripción oficial) -- la más adecuada como voz de
    // narrador/DM de las disponibles en qwen3-tts-flash. Otras alternativas
    // "potentes" del mismo catálogo: 'Vincent' (voz rasgada y grave, "evoca
    // ejércitos y gestas heroicas con una sola frase"), 'Ryan' (dramática,
    // con tensión narrativa), 'Andre' (voz masculina serena y magnética).
    // 'Sonrisa' (mujer latina alegre) y 'Bodega' (hombre español) son las dos
    // únicas descritas explícitamente como hispanohablantes "de acento", pero
    // el resto son igual de multilingües (todas listan español). Cambiar con
    // QWEN_TTS_VOICE si se prefiere otra -- ver la lista completa en
    // https://www.alibabacloud.com/help/en/model-studio/qwen-tts-voice-list
    this.voice = process.env.QWEN_TTS_VOICE ?? 'Bellona';
    this.languageType = process.env.QWEN_TTS_LANGUAGE ?? 'Spanish';
  }

  /** Sintetiza texto en español a un audio y devuelve los bytes crudos. */
  async synthesize(text: string): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error(
        'Falta QWEN_TTS_API_KEY: crea una API key en Alibaba Cloud Model Studio ' +
          '(consola, región Singapur) y añádela al .env. Ver README para el proceso completo.',
      );
    }

    const synthesisResponse = await fetch(`${this.baseUrl}/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: {
          text,
          voice: this.voice,
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
