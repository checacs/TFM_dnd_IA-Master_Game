import 'dotenv/config';
import { readFileSync } from 'fs';
import { extname } from 'path';

/**
 * Registra una voz clonada en Qwen (voice enrollment) a partir de un audio de
 * muestra local, y la deja lista para usar con QwenTtsService (ver
 * src/infrastructure/tts/qwen-tts.service.ts).
 *
 * Uso:
 *   npm run clone-voice -- assets/voice-samples/mi-voz.wav
 *   npm run clone-voice -- assets/voice-samples/mi-voz.wav mi-nombre
 *
 * Requisitos del audio (los exige la propia API de Qwen, ver
 * https://www.alibabacloud.com/help/en/model-studio/qwen-tts-voice-cloning):
 * WAV/MP3/M4A, mono, >=24kHz, 3-60s (recomendado 10-20s) de voz clara y
 * continua, sin música ni ruido de fondo, <10MB.
 *
 * Esto es un registro de UNA VEZ (no se ejecuta en cada arranque del server,
 * a diferencia de seed-maps.ts) -- el resultado (output.voice) es el id de
 * la voz clonada, que hay que pegar a mano en QWEN_TTS_CLONED_VOICE_ID en
 * .env. A partir de ahí, QwenTtsService la usa automáticamente (y cambia de
 * modelo solo, porque las voces clonadas no funcionan con qwen3-tts-flash,
 * necesitan un modelo VC dedicado -- ver el propio servicio).
 */

const MEDIA_TYPES: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

async function main() {
  const filePath = process.argv[2];
  const preferredName = process.argv[3] ?? 'mivoz';

  if (!filePath) {
    console.error('Uso: npm run clone-voice -- <ruta-al-wav> [nombre-opcional]');
    process.exit(1);
  }

  const apiKey = process.env.QWEN_TTS_API_KEY;
  if (!apiKey) {
    throw new Error('Falta QWEN_TTS_API_KEY en .env -- es la misma API key que ya usas para el TTS normal.');
  }

  const baseUrl = process.env.QWEN_TTS_BASE_URL ?? 'https://dashscope-intl.aliyuncs.com/api/v1';
  // Modelo VC (voice-cloning) no-streaming -- tiene que ser el mismo que
  // luego uses para sintetizar con esta voz (ver QWEN_TTS_VC_MODEL en
  // qwen-tts.service.ts). No sirve qwen3-tts-flash: los modelos VC son
  // dedicados y solo aceptan voces clonadas, nunca voces de catálogo.
  const targetModel = process.env.QWEN_TTS_VC_MODEL ?? 'qwen3-tts-vc-2026-01-22';

  const ext = extname(filePath).toLowerCase();
  const mediaType = MEDIA_TYPES[ext];
  if (!mediaType) {
    throw new Error(`Extensión no soportada (${ext}) -- usa .wav, .mp3 o .m4a.`);
  }

  const bytes = readFileSync(filePath);
  const sizeMb = bytes.length / (1024 * 1024);
  if (sizeMb > 10) {
    throw new Error(`El audio pesa ${sizeMb.toFixed(1)}MB -- el límite de Qwen es 10MB. Recorta o comprime la muestra.`);
  }

  // preferred_name: solo letras/números/guion bajo, máx 16 caracteres.
  const safeName = preferredName.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'mivoz';

  const dataUrl = `data:${mediaType};base64,${bytes.toString('base64')}`;

  console.log(`Registrando voz clonada a partir de ${filePath} (${sizeMb.toFixed(2)}MB, modelo destino: ${targetModel})...`);

  const response = await fetch(`${baseUrl}/services/audio/tts/customization`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen-voice-enrollment',
      input: {
        action: 'create',
        target_model: targetModel,
        preferred_name: safeName,
        audio: { data: dataUrl },
      },
    }),
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errBody = (body ?? {}) as { message?: string; code?: string };
    throw new Error(
      `Qwen no pudo registrar la voz (HTTP ${response.status}): ${errBody.message ?? errBody.code ?? JSON.stringify(body)}`,
    );
  }

  const voiceId = (body as { output?: { voice?: string } } | null)?.output?.voice;
  if (!voiceId) {
    throw new Error(`Respuesta sin output.voice: ${JSON.stringify(body)}`);
  }

  console.log('\n Voz clonada creada correctamente.\n');
  console.log(`   voice id:     ${voiceId}`);
  console.log(`   target_model: ${targetModel}\n`);
  console.log('Añade esto a tu .env para que el TTS la use por defecto:\n');
  console.log(`   QWEN_TTS_CLONED_VOICE_ID=${voiceId}`);
  console.log(`   QWEN_TTS_VC_MODEL=${targetModel}\n`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
