// High-Fidelity Audio & Voice Synthesis Service for Nabta AI

export interface VoiceSettings {
  lang: string;
  rate?: number;
  pitch?: number;
}

let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudioElement: HTMLAudioElement | null = null;
let isAudioPlaying = false;
let activeAudioListeners: Array<(isPlaying: boolean) => void> = [];

export function subscribeAudioState(listener: (isPlaying: boolean) => void) {
  activeAudioListeners.push(listener);
  return () => {
    activeAudioListeners = activeAudioListeners.filter((l) => l !== listener);
  };
}

function notifyAudioState(isPlaying: boolean) {
  isAudioPlaying = isPlaying;
  activeAudioListeners.forEach((l) => l(isPlaying));
}

export function cleanTextForSpeech(text: string, lang = "en"): string {
  if (!text) return "";
  let clean = String(text);

  // If Arabic, remove Latin words in brackets e.g. "الحماية (Protection)" -> "الحماية"
  if (lang.startsWith("ar")) {
    clean = clean.replace(/\([a-zA-Z\s\-_/]+\)/g, "");
  }

  // Strip Markdown characters, headers, bullets, and symbols before speech
  clean = clean
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/`[^`]*`/g, "")
    .replace(/\[\^?[^\]]*\]/g, "")
    .replace(/[-–—/\\•·>~_]/g, " ")
    .replace(/[:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return clean;
}

let preArmedAudio: HTMLAudioElement | null = null;

export function unlockAudio() {
  if (typeof window !== "undefined") {
    try {
      if (!preArmedAudio) {
        preArmedAudio = new Audio();
      }
      preArmedAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      preArmedAudio.volume = 0.01;
      preArmedAudio.play().catch(() => {});
    } catch {}

    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.resume();
      } catch {}
    }
  }
}

export function stopSpeaking() {
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
      activeAudioElement.src = "";
    } catch {}
    activeAudioElement = null;
  }

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
    activeUtterance = null;
  }

  notifyAudioState(false);
}

export function isSpeaking(): boolean {
  if (isAudioPlaying) return true;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    return window.speechSynthesis.speaking;
  }
  return false;
}

function findBestVoice(voices: SpeechSynthesisVoice[], targetLangPrefix: string): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;

  const langVoices = voices.filter((v) =>
    v.lang.toLowerCase().replace(/_/g, "-").startsWith(targetLangPrefix)
  );

  if (targetLangPrefix === "ar") {
    const priorityChecks = [
      (v: SpeechSynthesisVoice) =>
        v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Online"),
      (v: SpeechSynthesisVoice) =>
        v.name.includes("Siri") || v.name.includes("Enhanced"),
      (v: SpeechSynthesisVoice) =>
        v.name.includes("Laila") ||
        v.name.includes("Tarik") ||
        v.name.includes("Mariam") ||
        v.name.includes("Salma") ||
        v.name.includes("Shakir") ||
        v.name.includes("Hoda") ||
        v.name.includes("Naayf"),
      (v: SpeechSynthesisVoice) =>
        v.name.toLowerCase().includes("maged"),
      () => true,
    ];

    for (const check of priorityChecks) {
      const found = langVoices.find(check);
      if (found) return found;
    }

    const fallbackArabic = voices.find((v) =>
      v.name.toLowerCase().includes("arabic") ||
      v.name.toLowerCase().includes("maged") ||
      v.name.toLowerCase().includes("laila") ||
      v.name.toLowerCase().includes("tarik")
    );
    if (fallbackArabic) return fallbackArabic;

    return langVoices[0];
  }

  const best = langVoices.find(
    (v) =>
      v.name.includes("Natural") ||
      v.name.includes("Google") ||
      v.name.includes("Enhanced") ||
      v.name.includes("Samantha") ||
      v.name.includes("Jenny")
  );
  return best || langVoices[0];
}

function speakWithWebSpeech(
  cleanText: string,
  targetLangPrefix: string,
  options?: {
    rate?: number;
    pitch?: number;
    onEnd?: () => void;
    onError?: (err: any) => void;
  }
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    notifyAudioState(false);
    options?.onError?.(new Error("Speech synthesis not supported"));
    return;
  }

  const utterance = new SpeechSynthesisUtterance(cleanText);
  activeUtterance = utterance;

  utterance.rate = options?.rate ?? (targetLangPrefix === "ar" ? 0.98 : 1.0);
  utterance.pitch = options?.pitch ?? (targetLangPrefix === "ar" ? 1.02 : 1.0);
  utterance.lang = targetLangPrefix === "ar" ? "ar-SA" : "en-US";

  const voices = window.speechSynthesis.getVoices();
  const matchedVoice = findBestVoice(voices, targetLangPrefix);
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  let keepAliveTimer: any = null;
  const clearTimer = () => {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  };

  utterance.onstart = () => {
    notifyAudioState(true);
    clearTimer();
    keepAliveTimer = setInterval(() => {
      if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      } else {
        clearTimer();
      }
    }, 5000);
  };

  utterance.onend = () => {
    clearTimer();
    notifyAudioState(false);
    activeUtterance = null;
    options?.onEnd?.();
  };

  utterance.onerror = (e) => {
    clearTimer();
    notifyAudioState(false);
    activeUtterance = null;
    options?.onError?.(e);
  };

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    clearTimer();
    notifyAudioState(false);
    options?.onError?.(err);
  }
}

export function speakText(
  text: string,
  lang: "ar" | "en" | string = "en",
  options?: {
    rate?: number;
    pitch?: number;
    onEnd?: () => void;
    onError?: (err: any) => void;
  }
) {
  stopSpeaking();

  const cleanText = cleanTextForSpeech(text, lang);
  if (!cleanText) return;

  const targetLang = lang.startsWith("ar") ? "ar" : "en";

  // Tier 1: Try pristine High-Fidelity audio via backend /api/tts endpoint
  const audioUrl = `/api/tts?lang=${targetLang}&text=${encodeURIComponent(cleanText.slice(0, 300))}`;
  const audio = preArmedAudio || new Audio();
  activeAudioElement = audio;
  audio.src = audioUrl;
  audio.volume = 1.0;

  let hasEnded = false;
  audio.onplay = () => {
    notifyAudioState(true);
  };

  audio.onended = () => {
    if (hasEnded) return;
    hasEnded = true;
    notifyAudioState(false);
    activeAudioElement = null;
    options?.onEnd?.();
  };

  audio.onerror = () => {
    if (hasEnded) return;
    hasEnded = true;
    activeAudioElement = null;
    // Fallback to Web Speech API
    speakWithWebSpeech(cleanText, targetLang, options);
  };

  try {
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        if (hasEnded) return;
        hasEnded = true;
        activeAudioElement = null;
        speakWithWebSpeech(cleanText, targetLang, options);
      });
    }
  } catch {
    speakWithWebSpeech(cleanText, targetLang, options);
  }
}

export type SpeechRecognitionInstance = any;

export function createSpeechRecognizer(
  lang: "ar" | "en" | string,
  callbacks: {
    onResult: (transcript: string, isFinal: boolean) => void;
    onError?: (error: any) => void;
    onEnd?: () => void;
    onStart?: () => void;
  }
): { start: () => void; stop: () => void; isSupported: boolean } {
  if (typeof window === "undefined") {
    return { start: () => {}, stop: () => {}, isSupported: false };
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    return { start: () => {}, stop: () => {}, isSupported: false };
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = lang.startsWith("ar") ? "ar-EG" : "en-US";

  recognition.onstart = () => {
    callbacks.onStart?.();
  };

  recognition.onresult = (event: any) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    if (final) {
      callbacks.onResult(final, true);
    } else if (interim) {
      callbacks.onResult(interim, false);
    }
  };

  recognition.onerror = (event: any) => {
    callbacks.onError?.(event.error);
  };

  recognition.onend = () => {
    callbacks.onEnd?.();
  };

  return {
    start: () => {
      try {
        recognition.start();
      } catch (e) {
        console.warn("Speech recognition already running or error", e);
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch {}
    },
    isSupported: true,
  };
}
