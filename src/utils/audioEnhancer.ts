/**
 * Cadeia de processamento de áudio em tempo real (Web Audio API).
 * Roda 100% no navegador do usuário — não consome dados nem servidor.
 *
 * Cadeia aplicada:
 *  1. HighPass 80 Hz       → elimina hum elétrico (60/50 Hz), rumble, vento
 *  2. LowShelf -8dB @ 60Hz → reforço da remoção de subgraves
 *  3. Notch -2.5dB @ 250Hz → reduz "muddiness" típica de microfones baratos
 *  4. Peaking +2.5dB @ 3kHz→ realça a voz humana (clareza)
 *  5. Peaking +1.5dB @ 8kHz→ adiciona "ar" e brilho
 *  6. Compressor           → uniformiza volume e disfarça o chiado de fundo
 *  7. Makeup gain (1.15x)  → recupera o nível percebido
 */

let sharedCtx: AudioContext | null = null;
const attached = new WeakMap<HTMLMediaElement, {
  source: MediaElementAudioSourceNode;
  nodes: AudioNode[];
}>();

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedCtx) return sharedCtx;
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
  if (!Ctx) return null;
  try {
    sharedCtx = new Ctx();
    return sharedCtx;
  } catch {
    return null;
  }
}

export function enhanceVideoAudio(video: HTMLMediaElement): () => void {
  const ctx = getCtx();
  if (!ctx) return () => {};

  // Garante que o contexto está rodando (alguns browsers pausam até gesto do user)
  const resumeIfNeeded = () => {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  resumeIfNeeded();
  video.addEventListener('play', resumeIfNeeded);

  // Se já tem cadeia ligada, só retorna o cleanup que remove o listener
  if (attached.has(video)) {
    return () => {
      video.removeEventListener('play', resumeIfNeeded);
    };
  }

  let source: MediaElementAudioSourceNode;
  try {
    source = ctx.createMediaElementSource(video);
  } catch (err) {
    // Já foi conectado a outro contexto — fallback seguro: não processa
    console.warn('[audioEnhancer] não foi possível criar fonte:', err);
    video.removeEventListener('play', resumeIfNeeded);
    return () => {};
  }

  const highPass = ctx.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = 80;
  highPass.Q.value = 0.7;

  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 60;
  lowShelf.gain.value = -8;

  const mudCut = ctx.createBiquadFilter();
  mudCut.type = 'peaking';
  mudCut.frequency.value = 250;
  mudCut.Q.value = 1.0;
  mudCut.gain.value = -2.5;

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3000;
  presence.Q.value = 0.9;
  presence.gain.value = 2.5;

  const air = ctx.createBiquadFilter();
  air.type = 'peaking';
  air.frequency.value = 8000;
  air.Q.value = 0.7;
  air.gain.value = 1.5;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -26;
  compressor.knee.value = 14;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  const makeup = ctx.createGain();
  makeup.gain.value = 1.15;

  // Conecta a cadeia
  source
    .connect(highPass)
    .connect(lowShelf)
    .connect(mudCut)
    .connect(presence)
    .connect(air)
    .connect(compressor)
    .connect(makeup)
    .connect(ctx.destination);

  const nodes: AudioNode[] = [highPass, lowShelf, mudCut, presence, air, compressor, makeup];
  attached.set(video, { source, nodes });

  return () => {
    video.removeEventListener('play', resumeIfNeeded);
    // Não desconectamos a cadeia: a Web Audio bloqueia reconexão da mesma fonte;
    // o usuário pode tocar o vídeo de novo na mesma sessão sem precisar recriar.
  };
}
