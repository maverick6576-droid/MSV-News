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
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
}

export function speakStop(stop: Stop, settings: VoiceSettings, force = false): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (!force && (!settings.enabled || !settings.autoSpeak)) return;

  // Cancela cualquier locución anterior para evitar solapamientos
  window.speechSynthesis.cancel();

  const text = buildStopSpeechMessage(stop);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = Math.min(1.5, Math.max(0.6, settings.rate));
  utterance.volume = Math.min(1, Math.max(0, settings.volume));
  utterance.pitch = 1.0;

  const voice = pickSpanishVoice();
  if (voice) {
    utterance.voice = voice;
  }

  window.speechSynthesis.speak(utterance);
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
