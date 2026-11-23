import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import type { Stop, VoiceSettings } from '../types';

let cachedEsVoice: SpeechSynthesisVoice | null = null;

function pickSpanishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return cachedEsVoice;

  const exactEs = voices.find((v) => v.lang.toLowerCase() === 'es-es');
  const anyEs = voices.find((v) => v.lang.toLowerCase().startsWith('es'));
  cachedEsVoice = exactEs ?? anyEs ?? null;
  return cachedEsVoice;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    pickSpanishVoice();
  };
}

export function buildStopSpeechMessage(stop: Stop): string {
  const papers =
    stop.newspapers.length > 0
      ? stop.newspapers.length === 1
        ? stop.newspapers[0]
        : `${stop.newspapers.slice(0, -1).join(', ')} y ${stop.newspapers[stop.newspapers.length - 1]}`
      : 'Sin periódicos especificados';

  const cleanNotes = stop.notes.trim();
  if (cleanNotes) {
    return `${papers}, y se dejan en ${cleanNotes}`;
  }
  return `${papers}, en ${stop.address}`;
}

export function stopSpeaking(): void {
  if (Capacitor.isNativePlatform()) {
    void TextToSpeech.stop().catch(() => {});
    return;
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
}

export function speakStop(stop: Stop, settings: VoiceSettings, force = false): void {
  if (!force && (!settings.enabled || !settings.autoSpeak)) return;

  const text = buildStopSpeechMessage(stop);
  const rate = Math.min(1.5, Math.max(0.6, settings.rate));
  const volume = Math.min(1, Math.max(0, settings.volume));

  // En APK Android / iOS nativo usamos el motor nativo TextToSpeech del sistema
  if (Capacitor.isNativePlatform()) {
    void TextToSpeech.stop()
      .catch(() => {})
      .then(() =>
        TextToSpeech.speak({
          text,
          lang: 'es-ES',
          rate,
          pitch: 1.0,
          volume,
          category: 'ambient',
        })
      )
      .catch(() => {});
    return;
  }

  // En navegador web usamos Web Speech API
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = rate;
  utterance.volume = volume;
  utterance.pitch = 1.0;

  const voice = pickSpanishVoice();
  if (voice) {
    utterance.voice = voice;
  }

  window.speechSynthesis.speak(utterance);
}

export function isSpeechSupported(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
