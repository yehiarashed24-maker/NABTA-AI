// High-Fidelity Neural Audio & Hybrid Speech Recognition Service for Nabta AI

export interface VoiceSettings {
  lang: string;
  rate?: number;
  pitch?: number;
}

let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudioElement: HTMLAudioElement | null = null;
let isAudioPlaying = false;
let activeAudioListeners: Array<(isPlaying: boolean) => void> = [];
let currentPlayToken = 0;

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

  // Detect if text is primarily Arabic
  const hasArabic = /[\u0600-\u06FF]/.test(clean);
  if (hasArabic || lang.startsWith("ar")) {
    // Remove English technical glosses in parentheses e.g. "الحماية (Protection)" -> "الحماية"
    clean = clean.replace(/\([a-zA-Z0-9\s\-_/,.:]+\)/g, " ");
  }

  // Strip Markdown characters, headers, citations, bullets, and symbols before speech
  clean = clean
    .replace(/\[(?:صفحة|Page|p\.)\s*\d+\]/gi, " ")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/`[^`]*`/g, "")
    .replace(/\[\^?[^\]]*\]/g, "")
    .replace(/[-–—/\\•·>~_]/g, " ")
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
  currentPlayToken += 1;

  if (activeAudioElement) {
    try {
      activeAudioElement.onended = null;
      activeAudioElement.onerror = null;
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
        v.name.includes("Siri") || v.name.includes("Enhanced") || v.name.includes("Premium"),
      (v: SpeechSynthesisVoice) =>
        v.name.includes("Laila") ||
        v.name.includes("Tarik") ||
        v.name.includes("Mariam") ||
        v.name.includes("Salma") ||
        v.name.includes("Shakir") ||
        v.name.includes("Hoda") ||
        v.name.includes("Majed") ||
        v.name.includes("Maged"),
      () => true,
    ];

    for (const check of priorityChecks) {
      const found = langVoices.find(check);
      if (found) return found;
    }

    return langVoices[0];
  }

  const best = langVoices.find(
    (v) =>
      v.name.includes("Natural") ||
      v.name.includes("Google") ||
      v.name.includes("Enhanced") ||
      v.name.includes("Premium") ||
      v.name.includes("Samantha") ||
      v.name.includes("Ava") ||
      v.name.includes("Jenny")
  );
  return best || langVoices[0];
}

function speakWithBrowserSynthesis(
  cleanText: string,
  actualLang: string,
  token: number,
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

  const targetLangPrefix = actualLang.startsWith("ar") ? "ar" : "en";
  utterance.rate = Math.max(0.8, Math.min(1.1, options?.rate ?? (targetLangPrefix === "ar" ? 0.96 : 1.0)));
  utterance.pitch = options?.pitch ?? 1.0;
  utterance.lang = targetLangPrefix === "ar" ? "ar-EG" : "en-US";

  const voices = window.speechSynthesis.getVoices();
  const matchedVoice = findBestVoice(voices, targetLangPrefix);
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  utterance.onstart = () => {
    if (token !== currentPlayToken) return;
    notifyAudioState(true);
  };

  utterance.onend = () => {
    if (token !== currentPlayToken) return;
    notifyAudioState(false);
    activeUtterance = null;
    options?.onEnd?.();
  };

  utterance.onerror = (e) => {
    if (token !== currentPlayToken) return;
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
  if (typeof window === "undefined") return;

  stopSpeaking();
  const token = currentPlayToken;

  // Auto-detect language from the actual text so Arabic content always uses Arabic voice
  // and English content uses English voice regardless of UI language toggle.
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const actualLang = hasArabic ? "ar" : lang.startsWith("ar") ? "en" : lang;
  const cleanText = cleanTextForSpeech(text, actualLang);
  if (!cleanText) {
    options?.onEnd?.();
    return;
  }

  // Primary Engine: High-quality Server Neural TTS (/api/tts)
  const ttsUrl = `/api/tts?lang=${encodeURIComponent(actualLang)}&text=${encodeURIComponent(cleanText.slice(0, 1200))}`;
  const audio = new Audio(ttsUrl);
  activeAudioElement = audio;
  const desiredRate = Math.max(0.8, Math.min(1.15, options?.rate ?? 1.0));
  audio.playbackRate = desiredRate;

  audio.onplay = () => {
    if (token !== currentPlayToken) {
      audio.pause();
      return;
    }
    notifyAudioState(true);
  };

  audio.onended = () => {
    if (token !== currentPlayToken) return;
    activeAudioElement = null;
    notifyAudioState(false);
    options?.onEnd?.();
  };

  audio.onerror = () => {
    if (token !== currentPlayToken) return;
    activeAudioElement = null;
    // Fallback to browser SpeechSynthesis if neural TTS endpoint is unreachable
    speakWithBrowserSynthesis(cleanText, actualLang, token, options);
  };

  notifyAudioState(true);
  audio.play().catch(() => {
    if (token !== currentPlayToken) return;
    activeAudioElement = null;
    speakWithBrowserSynthesis(cleanText, actualLang, token, options);
  });
}

export type SpeechRecognitionInstance = any;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Hybrid Speech Recognizer:
 * Combines Web Speech API (with Safari interim-result flush + silence debounce)
 * AND MediaRecorder + Gemini Audio STT (/api/stt) fallback so voice input works reliably
 * across macOS Safari, Chrome, Edge, Brave, Firefox, and mobile browsers.
 */
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

  const hasMediaDevices = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const isSupported = Boolean(SpeechRecognition || hasMediaDevices);

  let recognition: any = null;
  let mediaRecorder: MediaRecorder | null = null;
  let mediaStream: MediaStream | null = null;
  let audioChunks: BlobPart[] = [];
  let audioContext: AudioContext | null = null;
  let silenceRafId: number | null = null;
  let silenceTimer: any = null;

  let latestTranscript = "";
  let finalEmitted = false;
  let isRunning = false;
  let stoppingManually = false;

  const cleanupMedia = () => {
    if (silenceRafId !== null) {
      cancelAnimationFrame(silenceRafId);
      silenceRafId = null;
    }
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (audioContext) {
      try {
        audioContext.close();
      } catch {}
      audioContext = null;
    }
    if (mediaStream) {
      try {
        mediaStream.getTracks().forEach((t) => t.stop());
      } catch {}
      mediaStream = null;
    }
  };

  const emitFinalIfPending = (text: string) => {
    const cleaned = String(text || "").trim();
    if (cleaned && !finalEmitted) {
      finalEmitted = true;
      callbacks.onResult(cleaned, true);
      return true;
    }
    return false;
  };

  const transcribeRecordedAudio = async (blob: Blob, mimeType: string) => {
    if (finalEmitted || blob.size < 800) {
      callbacks.onEnd?.();
      return;
    }
    try {
      const base64 = await blobToBase64(blob);
      const res = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64,
          mimeType,
          lang,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.transcript && String(data.transcript).trim()) {
          emitFinalIfPending(String(data.transcript).trim());
        }
      }
    } catch (err) {
      console.warn("Fallback STT notice:", err);
    } finally {
      callbacks.onEnd?.();
    }
  };

  const startMediaRecorderBackup = async () => {
    if (!hasMediaDevices) return;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      let chosenType = "";
      if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
        chosenType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      }

      audioChunks = [];
      mediaRecorder = chosenType
        ? new MediaRecorder(mediaStream, { mimeType: chosenType })
        : new MediaRecorder(mediaStream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder?.mimeType || chosenType || "audio/webm";
        const blob = new Blob(audioChunks, { type: mimeType });
        cleanupMedia();

        // If Web Speech API already produced a transcript, flush it immediately
        if (latestTranscript.trim()) {
          emitFinalIfPending(latestTranscript);
          callbacks.onEnd?.();
        } else {
          // Otherwise use Gemini Audio STT on the recorded microphone blob!
          transcribeRecordedAudio(blob, mimeType);
        }
      };

      mediaRecorder.start(250);

      // Voice Activity / Silence Detection using Web Audio API
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
        const source = audioContext!.createMediaStreamSource(mediaStream);
        const analyser = audioContext!.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        let hasSpoken = false;
        let silenceStart = 0;
        const startedAt = Date.now();

        const checkVolume = () => {
          if (!isRunning || finalEmitted) return;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length;

          if (avg > 16) {
            hasSpoken = true;
            silenceStart = 0;
          } else if (hasSpoken) {
            if (!silenceStart) {
              silenceStart = Date.now();
            } else if (Date.now() - silenceStart > 1750) {
              // User spoke and paused for 1.75s -> stop recording & transcribe!
              stopAll();
              return;
            }
          } else if (Date.now() - startedAt > 12000) {
            // 12 seconds of total silence -> auto stop
            stopAll();
            return;
          }
          silenceRafId = requestAnimationFrame(checkVolume);
        };
        silenceRafId = requestAnimationFrame(checkVolume);
      }
    } catch (err) {
      // If getUserMedia fails or is denied and SpeechRecognition is also not running
      if (!recognition) {
        callbacks.onError?.(err);
        callbacks.onEnd?.();
      }
    }
  };

  const stopAll = () => {
    if (!isRunning && stoppingManually) return;
    isRunning = false;
    stoppingManually = true;

    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }

    if (recognition) {
      try {
        recognition.stop();
      } catch {}
    }

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try {
        mediaRecorder.stop();
        return; // mediaRecorder.onstop will handle final flush / STT
      } catch {}
    }

    cleanupMedia();
    if (latestTranscript.trim()) {
      emitFinalIfPending(latestTranscript);
    }
    callbacks.onEnd?.();
  };

  return {
    start: () => {
      stopSpeaking();
      latestTranscript = "";
      finalEmitted = false;
      isRunning = true;
      stoppingManually = false;

      callbacks.onStart?.();

      // Start MediaRecorder + Silence Detector in parallel so Safari/Firefox always capture voice
      startMediaRecorderBackup();

      if (SpeechRecognition) {
        try {
          recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = lang.startsWith("ar") ? "ar-EG" : "en-US";

          recognition.onresult = (event: any) => {
            let combined = "";
            let hasFinalChunk = false;
            for (let i = 0; i < event.results.length; ++i) {
              combined += event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                hasFinalChunk = true;
              }
            }
            const cleanCombined = combined.trim();
            if (cleanCombined) {
              latestTranscript = cleanCombined;
              callbacks.onResult(cleanCombined, false);

              if (silenceTimer) clearTimeout(silenceTimer);
              silenceTimer = setTimeout(() => {
                if (latestTranscript.trim() && !finalEmitted) {
                  emitFinalIfPending(latestTranscript);
                  stopAll();
                }
              }, hasFinalChunk ? 900 : 1700);
            }
          };

          recognition.onerror = (event: any) => {
            // Do not kill MediaRecorder fallback on Safari SpeechRecognition errors!
            if (!hasMediaDevices && !latestTranscript.trim()) {
              callbacks.onError?.(event.error);
            }
          };

          recognition.onend = () => {
            // If Safari ended recognition with an interim transcript, flush it!
            if (latestTranscript.trim() && !finalEmitted) {
              emitFinalIfPending(latestTranscript);
              stopAll();
            } else if (!mediaRecorder || mediaRecorder.state === "inactive") {
              isRunning = false;
              callbacks.onEnd?.();
            }
          };

          recognition.start();
        } catch (e) {
          console.warn("Web Speech API start notice:", e);
        }
      }
    },
    stop: () => {
      stopAll();
    },
    isSupported,
  };
}
