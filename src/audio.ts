// Web Speech API Voice and Audio Synthesis Service for Nabta AI

export interface VoiceSettings {
  lang: string;
  rate?: number;
  pitch?: number;
}

let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudioListeners: Array<(isPlaying: boolean) => void> = [];

export function subscribeAudioState(listener: (isPlaying: boolean) => void) {
  activeAudioListeners.push(listener);
  return () => {
    activeAudioListeners = activeAudioListeners.filter((l) => l !== listener);
  };
}

function notifyAudioState(isPlaying: boolean) {
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

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    
    // macOS/Chrome workaround to truly clear the TTS queue
    try {
      const workaround = new SpeechSynthesisUtterance("");
      workaround.volume = 0;
      window.speechSynthesis.speak(workaround);
      window.speechSynthesis.cancel();
    } catch {}

    activeUtterance = null;
    notifyAudioState(false);
  }
}

export function isSpeaking(): boolean {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    return window.speechSynthesis.speaking;
  }
  return false;
}

function findBestVoice(voices: SpeechSynthesisVoice[], targetLangPrefix: string): SpeechSynthesisVoice | undefined {
  const langVoices = voices.filter((v) =>
    v.lang.toLowerCase().replace(/_/g, "-").startsWith(targetLangPrefix)
  );
  if (!langVoices.length) return undefined;

  if (targetLangPrefix === "ar") {
    // Priority order for natural Arabic voices:
    // 1. Google Online / Natural / Siri
    // 2. High-quality Apple / Microsoft voices: Laila, Tarik, Mariam, Salma, Shakir
    // 3. Any non-robotic voice (filter out Maged and compact low-res)
    // 4. Fallback only if nothing else exists
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
        !v.name.toLowerCase().includes("maged") && !v.name.toLowerCase().includes("compact"),
      () => true,
    ];

    for (const check of priorityChecks) {
      const found = langVoices.find(check);
      if (found) return found;
    }
  }

  // English or other languages
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
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    console.warn("SpeechSynthesis not supported in this browser.");
    options?.onError?.(new Error("Speech synthesis not supported"));
    return;
  }

  stopSpeaking();

  const cleanText = cleanTextForSpeech(text, lang);
  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  activeUtterance = utterance;

  // Configure speech rate & pitch for clear human cadence
  utterance.rate = options?.rate ?? (lang.startsWith("ar") ? 0.98 : 1.0);
  utterance.pitch = options?.pitch ?? (lang.startsWith("ar") ? 1.02 : 1.0);

  // Language setup
  const targetLangPrefix = lang.startsWith("ar") ? "ar" : "en";
  utterance.lang = targetLangPrefix === "ar" ? "ar-SA" : "en-US";

  // Pick best available voice (Google, Siri, Laila, Tarik > Maged)
  const voices = window.speechSynthesis.getVoices();
  const matchedVoice = findBestVoice(voices, targetLangPrefix);

  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  utterance.onstart = () => {
    notifyAudioState(true);
  };

  utterance.onend = () => {
    notifyAudioState(false);
    activeUtterance = null;
    options?.onEnd?.();
  };

  utterance.onerror = (e) => {
    notifyAudioState(false);
    activeUtterance = null;
    options?.onError?.(e);
  };

  window.speechSynthesis.speak(utterance);
}

// Ensure voices are loaded (Chrome/Safari async voice loading)
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
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
    const current = final || interim;
    if (current) {
      callbacks.onResult(current, Boolean(final));
    }
  };

  recognition.onerror = (event: any) => {
    callbacks.onError?.(event);
  };

  recognition.onend = () => {
    callbacks.onEnd?.();
  };

  return {
    start: () => {
      try {
        recognition.start();
      } catch (err) {
        // May already be started
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch (err) {}
    },
    isSupported: true,
  };
}
