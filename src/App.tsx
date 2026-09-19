import React, { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Edit2,
  FileText,
  HelpCircle,
  History,
  Layers,
  LayoutDashboard,
  Leaf,
  ListRestart,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  Mic,
  MicOff,
  Play,
  Plus,
  Quote,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sliders,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { I18nProvider, useI18n, LanguageSwitcher } from "./i18n";
import {
  Citation,
  DocumentItem,
  Message,
  Guide,
  Question,
  Quiz,
  Attempt,
  Concept,
  MasteryEvidence,
  NextBestAction,
  VivaAttempt,
  Workspace,
  AuthUser,
  Account,
} from "./types";
import { VoiceTutorModal } from "./components/VoiceTutorModal";
import { VivaModal } from "./components/VivaModal";
import { QuizModal } from "./components/QuizModal";
import { ConceptDrawer } from "./components/ConceptDrawer";
import { FormattedMessage } from "./components/FormattedMessage";
import { speakText, stopSpeaking, isSpeaking, createSpeechRecognizer } from "./audio";


const api = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json"))
    throw new Error(
      "The Nabta API is not running. Start the app with “npm run dev”, not “vite”.",
    );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Something went wrong");
  return body;
};
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message || "The page could not load." };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash-page">
        <div>
          <Leaf />
          <span className="eyebrow">LET’S FIX THIS</span>
          <h1>Nabta hit a small snag.</h1>
          <p>{this.state.error}</p>
          <button
            onClick={() => {
              window.location.href = "/app";
            }}
          >
            Try again <ArrowRight />
          </button>
        </div>
      </main>
    );
  }
}
function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return path;
}
function useTypewriter(text: string, speed = 32, startDelay = 420) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    let timer = 0;
    let interval = 0;
    let index = 0;
    timer = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setDisplayed(text.slice(0, ++index));
        if (index >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
    }, startDelay);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [text, speed, startDelay]);
  return { displayed, done };
}

const Brand = ({ light = false }: { light?: boolean }) => {
  const { t } = useI18n();
  return (
    <button
      className={`brand ${light ? "brand-light" : ""}`}
      onClick={() => navigate("/")}
      aria-label="Nabta AI home"
    >
      <span>{t("brandName")} AI</span>
      <span className="brand-mark">
        <Leaf size={17} strokeWidth={2.5} />
      </span>
    </button>
  );
};

const BackgroundVideo = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetTime = useRef(0);
  const prevX = useRef<number | null>(null);
  const seeking = useRef(false);
  useEffect(() => {
    const move = (event: MouseEvent) => {
      const video = videoRef.current;
      if (!video || Number.isNaN(video.duration)) return;
      if (prevX.current === null) {
        prevX.current = event.clientX;
        return;
      }
      const delta = event.clientX - prevX.current;
      prevX.current = event.clientX;
      targetTime.current = Math.max(
        0,
        Math.min(
          targetTime.current +
          (delta / window.innerWidth) * 0.8 * video.duration,
          video.duration,
        ),
      );
      if (!seeking.current) {
        seeking.current = true;
        video.currentTime = targetTime.current;
      }
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);
  return (
    <video
      ref={videoRef}
      src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260530_042513_df96a13b-6155-4f6e-8b93-c9dee66fba08.mp4"
      muted
      playsInline
      preload="auto"
      onSeeked={() => {
        const video = videoRef.current;
        if (!video) return;
        if (Math.abs(video.currentTime - targetTime.current) > 0.05)
          video.currentTime = targetTime.current;
        else seeking.current = false;
      }}
      className="hero-video"
    />
  );
};
const LandingNav = () => {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <>
      <nav className="landing-nav">
        <Brand />
        <div className="landing-links">
          <a href="#how">{t("navHow")}</a>
          <span>, </span>
          <a href="#features">{t("navFeatures")}</a>
          <span>, </span>
          <a href="#preview">{t("navPreview")}</a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <LanguageSwitcher variant="pill" />
          <button className="text-link" onClick={() => navigate("/app")}>
            {t("navStart")}
          </button>
        </div>
        <button
          className="mobile-menu"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          <Menu />
        </button>
      </nav>
      {open && (
        <div className="mobile-sheet">
          <button onClick={() => setOpen(false)}>
            <X />
          </button>
          <div style={{ padding: "10px 0" }}>
            <LanguageSwitcher variant="pill" />
          </div>
          <a href="#how" onClick={() => setOpen(false)}>
            {t("navHow")}
          </a>
          <a href="#features" onClick={() => setOpen(false)}>
            {t("navFeatures")}
          </a>
          <button onClick={() => navigate("/app")}>
            {t("navStart")} <ArrowRight />
          </button>
        </div>
      )}
    </>
  );
};
const Hero = () => {
  const { t } = useI18n();
  const { displayed, done } = useTypewriter(
    t("heroTypewriter"),
  );
  return (
    <section className="hero">
      <BackgroundVideo />
      <LandingNav />
      <div className="hero-content">
        <p className="hero-intro blur-copy">
          {t("heroIntro1")}
          <br />
          {t("heroIntro2")}
        </p>
        <h1>
          {displayed}
          {!done && <span className="cursor" />}
        </h1>
        <div className="hero-actions">
          <button className="pill light" onClick={() => navigate("/app")}>
            {t("heroStartBtn")}
          </button>
          <a className="pill ghost" href="#how">
            {t("heroHowBtn")} <ArrowRight size={14} />
          </a>
        </div>
      </div>
      <div className="hero-foot">
        <span>{t("heroFoot1")}</span>
        <span>{t("heroFoot2")}</span>
      </div>
    </section>
  );
};

const Landing = () => {
  const { t } = useI18n();
  return (
    <main className="landing">
      <Hero />
      <section id="how" className="section how">
        <div className="section-kicker">{t("sec01Kicker")}</div>
        <div className="section-heading">
          <h2>
            {t("sec01Title").split("\n")[0]}
            <br />
            {t("sec01Title").split("\n")[1] || ""}
          </h2>
          <p>
            {t("sec01Subtitle")}
          </p>
        </div>
        <div className="steps">
          {[
            [
              t("step01Num"),
              t("step01Title"),
              t("step01Desc"),
            ],
            [
              t("step02Num"),
              t("step02Title"),
              t("step02Desc"),
            ],
            [
              t("step03Num"),
              t("step03Title"),
              t("step03Desc"),
            ],
          ].map(([number, title, copy]) => (
            <article className="step-card" key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
              <ChevronRight />
            </article>
          ))}
        </div>
      </section>
      <section id="features" className="section features">
        <div className="feature-title">
          <span className="section-kicker">{t("sec02Kicker")}</span>
          <h2>
            {t("sec02Title")}
          </h2>
        </div>
        <div className="feature-grid">
          <article className="feature-card feature-large">
            <div className="feature-icon">
              <MessageCircle />
            </div>
            <div>
              <span className="tag">{t("feat1Title")}</span>
              <h3>{t("feat1Title")}</h3>
              <p>
                {t("feat1Desc")}
              </p>
            </div>
            <div className="mini-chat">
              <p>{t("miniChatQ")}</p>
              <div>
                <Sparkles size={16} />
                <span>{t("miniChatA")}</span>
              </div>
              <button>{t("miniChatSource")}</button>
            </div>
          </article>
          <article className="feature-card lime">
            <div className="feature-icon">
              <BookOpen />
            </div>
            <span className="tag">{t("feat2Title")}</span>
            <h3>{t("feat2Title")}</h3>
            <p>
              {t("feat2Desc")}
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">
              <Target />
            </div>
            <span className="tag">{t("feat3Title")}</span>
            <h3>{t("feat3Title")}</h3>
            <p>
              {t("feat3Desc")}
            </p>
            <div className="score-ring">
              <strong>84</strong>
              <span>{t("confidenceLabel")}</span>
            </div>
          </article>
        </div>
      </section>
      <section id="preview" className="section preview">
        <div className="preview-copy">
          <span className="section-kicker">{t("sec03Kicker")}</span>
          <h2>
            {t("sec03Title").split("\n")[0]}
            <br />
            {t("sec03Title").split("\n")[1] || ""}
          </h2>
          <p>
            {t("sec03Subtitle")}
          </p>
          <button className="solid-button" onClick={() => navigate("/app")}>
            {t("sec03Btn")} <ArrowRight size={18} />
          </button>
        </div>
        <div className="app-preview">
          <div className="preview-sidebar">
            <Brand light />
            <div className="preview-nav active">
              <LayoutDashboard size={16} />
              {t("navOverview")}
            </div>
            <div className="preview-nav">
              <MessageCircle size={16} />
              {t("navTutor")}
            </div>
            <div className="preview-nav">
              <BookOpen size={16} />
              {t("navGuide")}
            </div>
            <div className="preview-nav">
              <Target size={16} />
              {t("navPractice")}
            </div>
          </div>
          <div className="preview-main">
            <div className="preview-top">
              <div>
                <span>{t("previewGreeting")}</span>
                <h3>{t("previewDocTitle")}</h3>
              </div>
              <button>
                <Plus size={15} /> {t("previewAddBtn")}
              </button>
            </div>
            <div className="preview-stats">
              <div>
                <span>{t("previewMastery")}</span>
                <strong>78%</strong>
              </div>
              <div>
                <span>{t("previewStreak")}</span>
                <strong>{t("previewStreakVal")}</strong>
              </div>
              <div>
                <span>{t("previewNextFocus")}</span>
                <strong>{t("previewNextTopic")}</strong>
              </div>
            </div>
            <div className="preview-panel">
              <span>{t("previewThisWeek")}</span>
              <div className="bars">
                {[36, 62, 48, 83, 56, 92, 72].map((height, index) => (
                  <i key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="quote-section">
        <Quote />
        <blockquote>
          {t("quoteText1")}
          <br />
          {t("quoteText2")}
        </blockquote>
      </section>
      <section className="cta">
        <div>
          <span className="eyebrow">{t("ctaSubtitle")}</span>
          <h2>
            {t("ctaTitle")}
          </h2>
          <button onClick={() => navigate("/app")}>
            {t("ctaBtn")} <ArrowRight />
          </button>
        </div>
        <div className="orb">
          <Leaf />
        </div>
      </section>
      <footer>
        <Brand light />
        <p>{t("footerCopy")}</p>
        <div>
          <a href="#how">{t("navHow")}</a>
          <a href="#features">{t("navFeatures")}</a>
          <button onClick={() => navigate("/app")}>{t("navStart")}</button>
        </div>
      </footer>
    </main>
  );
};

const LoginPage = ({ onAuth }: { onAuth: (user: AuthUser) => void }) => {
  const { t } = useI18n();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      try {
        const config = await api<{ googleClientId: string }>("/api/config");
        if (!config.googleClientId) return;
        const initialize = () => {
          if (cancelled || !(window as any).google || !buttonRef.current)
            return;
          (window as any).google.accounts.id.initialize({
            client_id: config.googleClientId,
            callback: async ({ credential }: { credential: string }) => {
              try {
                const user = await api<AuthUser>("/api/auth/google", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ credential }),
                });
                onAuth(user);
              } catch (err) {
                setError((err as Error).message);
              }
            },
          });
          (window as any).google.accounts.id.renderButton(buttonRef.current, {
            theme: "outline",
            size: "large",
            shape: "rectangular",
            text: "continue_with",
            width: 320,
          });
        };
        if ((window as any).google) initialize();
        else {
          const script = document.createElement("script");
          script.src = "https://accounts.google.com/gsi/client";
          script.async = true;
          script.onload = initialize;
          document.head.appendChild(script);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    };
    setup();
    return () => {
      cancelled = true;
    };
  }, [onAuth]);
  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <Brand light />
        <div>
          <span className="eyebrow">{t("loginPanelEyebrow")}</span>
          <h1>
            {t("brandTagline")}
          </h1>
          <p>
            {t("feat1Desc")}
          </p>
        </div>
        <small>{t("footerCopy")}</small>
      </section>
      <section className="login-card-wrap">
        <div className="login-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div className="login-seed" style={{ margin: 0 }}>
              <Leaf />
            </div>
            <LanguageSwitcher variant="header" />
          </div>
          <span className="eyebrow">{t("loginWelcome")}</span>
          <h2>
            {t("loginSubtitle")}
          </h2>
          <div className="google-button" ref={buttonRef} />
          {error && <div className="form-error">{error}</div>}
          <small>
            By continuing, you agree to use Nabta for learning responsibly.
          </small>
        </div>
      </section>
    </main>
  );
};
const AuthBoundary = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<AuthUser>("/api/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <div className="full-loader">
        <Leaf />
        <Loader2 className="spin" />
        <span>Opening your study space…</span>
      </div>
    );
  if (!user) return <LoginPage onAuth={setUser} />;
  return <>{children}</>;
};
const AppSidebar = ({
  active = "dashboard",
  onUpload,
  onTabChange,
}: {
  active?: string;
  onUpload?: () => void;
  onTabChange?: (tab: string) => void;
}) => {
  const { t } = useI18n();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => {
    api<AuthUser>("/api/auth/me")
      .then(setUser)
      .catch(() => null);
    api<Account>("/api/account")
      .then(setAccount)
      .catch(() => null);
  }, []);
  const go = (tab: string) =>
    onTabChange ? onTabChange(tab) : navigate("/app");
  const name = account?.displayName || user?.name || "My study space";
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "N";
  return (
    <aside className="app-sidebar">
      <Brand light />
      <button
        className={`profile ${active === "account" ? "active" : ""}`}
        onClick={() => navigate("/account")}
        title="Open Nabta account"
      >
        <div>
          {user?.picture ? (
            <img src={user.picture} alt="" referrerPolicy="no-referrer" />
          ) : (
            initials
          )}
        </div>
        <span>
          <strong>{name}</strong>
          <small>{user?.isGuest ? t("localGuest") : user?.email}</small>
        </span>
        <ChevronRight />
      </button>
      <div className="app-nav">
        <button
          className={active === "dashboard" ? "active" : ""}
          onClick={() => navigate("/app")}
        >
          <LayoutDashboard />
          {t("navOverview")}
        </button>
        {active !== "dashboard" && active !== "account" && (
          <>
            <button
              className={active === "tutor" ? "active" : ""}
              onClick={() => go("tutor")}
            >
              <MessageCircle />
              {t("navTutor")}
            </button>
            <button
              className={active === "guide" ? "active" : ""}
              onClick={() => go("guide")}
            >
              <BookOpen />
              {t("navGuide")}
            </button>
            <button
              className={active === "quiz" ? "active" : ""}
              onClick={() => go("quiz")}
            >
              <Target />
              {t("navPractice")}
            </button>
            <button
              className={active === "progress" ? "active" : ""}
              onClick={() => go("progress")}
            >
              <BarChart3 />
              {t("navProgress")}
            </button>
          </>
        )}
      </div>
      <div className="sidebar-grow">
        <div className="seed-icon">
          <Leaf />
        </div>
        <strong>{t("sidebarGrowTitle")}</strong>
        <p>{t("sidebarGrowDesc")}</p>
        {onUpload && (
          <button onClick={onUpload}>
            <Plus /> {t("newNotebook")}
          </button>
        )}
      </div>
    </aside>
  );
};

const UploadModal = ({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (workspace: Workspace) => void;
}) => {
  const { t } = useI18n();
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      if (file) data.append("file", file);
      if (text) data.append("text", text);
      if (title) data.append("title", title);
      const workspace = await api<Workspace>("/api/workspaces", {
        method: "POST",
        body: data,
      });
      onCreated(workspace);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="upload-modal" onSubmit={submit}>
        <button type="button" className="modal-close" onClick={onClose}>
          <X />
        </button>
        <span className="modal-kicker">{t("modalKicker")}</span>
        <h2>{t("modalTitle")}</h2>
        <p>{t("modalDesc")}</p>
        <div className="mode-tabs">
          <button
            type="button"
            className={mode === "file" ? "active" : ""}
            onClick={() => setMode("file")}
          >
            <FileText />
            {t("modalTabPdf")}
          </button>
          <button
            type="button"
            className={mode === "text" ? "active" : ""}
            onClick={() => setMode("text")}
          >
            <BookOpen />
            {t("modalTabPaste")}
          </button>
        </div>
        {mode === "file" ? (
          <label className={`dropzone ${file ? "has-file" : ""}`}>
            <input
              type="file"
              accept="application/pdf,text/plain"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <UploadCloud />
            {file ? (
              <>
                <strong>{file.name}</strong>
                <span>
                  {(file.size / 1024 / 1024).toFixed(2)} MB · Ready
                </span>
              </>
            ) : (
              <>
                <strong>{t("modalDropzone")}</strong>
                <span>{t("modalDropzoneSub")}</span>
              </>
            )}
          </label>
        ) : (
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("modalPastePlaceholder")}
            rows={8}
          />
        )}
        <label className="field-label">
          {t("modalTitleLabel")}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("modalTitlePlaceholder")}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button
          className="primary-submit"
          disabled={busy || (mode === "file" ? !file : text.trim().length < 40)}
        >
          {busy ? (
            <>
              <Loader2 className="spin" /> {t("modalSubmitting")}
            </>
          ) : (
            <>
              {t("modalSubmit")} <ArrowRight />
            </>
          )}
        </button>
        <div className="privacy-note">
          <Check /> {t("footerCopy")}
        </div>
      </form>
    </div>
  );
};
const EmptyDashboard = ({ onUpload }: { onUpload: () => void }) => {
  const { t } = useI18n();
  return (
    <div className="empty-dashboard">
      <div className="empty-art">
        <div className="sun" />
        <div className="sprout">
          <Leaf />
        </div>
        <span className="ground" />
      </div>
      <span className="eyebrow">{t("dashEyebrow")}</span>
      <h2>
        {t("emptyTitle")}
      </h2>
      <p>
        {t("emptyDesc")}
      </p>
      <div>
        <button className="dark-button" onClick={onUpload}>
          <Plus /> {t("emptyBtn")}
        </button>
      </div>
    </div>
  );
};
const Dashboard = () => {
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState(false);
  const load = () =>
    api<Workspace[]>("/api/workspaces")
      .then(setWorkspaces)
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);
  const scores = workspaces.flatMap((item) =>
    item.attempts.map((attempt) => attempt.score),
  );
  const avg = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
  return (
    <div className="app-shell">
      <AppSidebar onUpload={() => setUpload(true)} />
      <main className="dashboard">
        <header className="app-header">
          <div>
            <span className="eyebrow">{t("dashEyebrow")}</span>
            <h1>{t("dashGreeting")}</h1>
            <p>{t("dashSub")}</p>
          </div>
          <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <LanguageSwitcher variant="header" />
            <button className="new-button" onClick={() => setUpload(true)}>
              <Plus /> {t("newNotebook")}
            </button>
          </div>
        </header>
        {loading ? (
          <div className="skeleton-grid">
            <i />
            <i />
            <i />
          </div>
        ) : workspaces.length === 0 ? (
          <EmptyDashboard onUpload={() => setUpload(true)} />
        ) : (
          <>
            <section className="metric-grid">
              <div>
                <span>
                  <FileText /> {t("metricNotebooks")}
                </span>
                <strong>{workspaces.length}</strong>
                <small>
                  {t("metricSourceDocs", {
                    count: workspaces.reduce(
                      (sum, item) => sum + item.documents.length,
                      0,
                    ),
                  })}
                </small>
              </div>
              <div>
                <span>
                  <Target /> {t("metricAvgScore")}
                </span>
                <strong>
                  {avg || "—"}
                  {avg ? "%" : ""}
                </strong>
                <small>
                  {t("metricCompletedQuizzes", { count: scores.length })}
                </small>
              </div>
              <div>
                <span>
                  <Brain /> {t("metricFocusTopics")}
                </span>
                <strong>
                  {new Set(workspaces.flatMap((item) => item.weakTopics)).size}
                </strong>
                <small>{t("metricWaitReview")}</small>
              </div>
            </section>
            <section className="notebooks">
              <div className="row-heading">
                <div>
                  <span className="eyebrow">{t("libEyebrow")}</span>
                  <h2>{t("libTitle")}</h2>
                </div>
                <label className="search">
                  <Search />
                  <input placeholder={t("searchPlaceholder")} />
                </label>
              </div>
              <div className="notebook-grid">
                {workspaces.map((workspace, index) => (
                  <button
                    className="notebook-card"
                    key={workspace.id}
                    onClick={() => navigate(`/study/${workspace.id}`)}
                  >
                    <div className={`notebook-cover cover-${index % 4}`}>
                      <Leaf />
                      <span>
                        {t("pagesCount", { count: workspace.documents[0]?.pageCount || 1 })}
                      </span>
                    </div>
                    <div className="notebook-info">
                      <h3>{workspace.title}</h3>
                      <p>
                        {workspace.weakTopics.length
                          ? t("focusOn", { topic: workspace.weakTopics[0] })
                          : t("readyFirstSession")}
                      </p>
                      <small>
                        <Clock3 /> Updated{" "}
                        {new Date(workspace.lastStudiedAt).toLocaleDateString()}
                      </small>
                    </div>
                    <ArrowRight className="card-arrow" />
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
        {upload && (
          <UploadModal
            onClose={() => setUpload(false)}
            onCreated={(workspace) => navigate(`/study/${workspace.id}`)}
          />
        )}
      </main>
    </div>
  );
};

const StudyGuide = ({
  workspace,
  refresh,
  onPracticeConcept,
  onAskTutorConcept,
}: {
  workspace: Workspace;
  refresh: () => Promise<void>;
  onPracticeConcept?: (concept: string) => void;
  onAskTutorConcept?: (concept: string) => void;
}) => {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSpeakingGuide, setIsSpeakingGuide] = useState(false);

  const guide = workspace.guide?.content;

  const generate = async () => {
    setBusy(true);
    try {
      await api(`/api/workspaces/${workspace.id}/guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const regenerateSection = async (sectionKey: string) => {
    setRegeneratingSection(sectionKey);
    try {
      await api(`/api/workspaces/${workspace.id}/guide/section`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionKey, language: lang }),
      });
      await refresh();
    } catch (err: any) {
      alert(err.message || "Failed to regenerate section");
    } finally {
      setRegeneratingSection(null);
    }
  };

  const copySection = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleListenGuide = () => {
    if (isSpeakingGuide) {
      stopSpeaking();
      setIsSpeakingGuide(false);
    } else {
      const summary = `${guide?.title || workspace.title}. Overview: ${guide?.overview || ""}.`;
      setIsSpeakingGuide(true);
      speakText(summary, lang, {
        onEnd: () => setIsSpeakingGuide(false),
      });
    }
  };

  if (!guide)
    return (
      <div className="panel-empty">
        <div className="line-icon">
          <BookOpen />
        </div>
        <span className="eyebrow">{t("guideEmptyEyebrow")}</span>
        <h2>{t("guideEmptyTitle")}</h2>
        <p>{t("guideEmptyDesc")}</p>
        <button className="dark-button" onClick={generate} disabled={busy}>
          {busy ? <Loader2 className="spin" /> : <Sparkles />}{" "}
          {busy ? t("guideBuilding") : t("guideGenerateBtn")}
        </button>
      </div>
    );

  const coreConcepts = guide.coreConcepts || (guide.concepts as any[]) || [];
  const keyDefinitions = guide.keyDefinitions || (guide.definitions as any[]) || [];
  const learningObjectives = guide.learningObjectives || [];
  const commonMistakes = guide.commonMistakes || [];
  const quickRecap = guide.quickRecap || (guide.revision as any[]) || [];
  const rules = guide.formulasOrRules || [];
  const suggestedTopics = guide.suggestedQuizTopics || [];

  return (
    <div className="guide-view">
      <div className="guide-hero">
        <div className="guide-hero-content">
          <span className="eyebrow">{t("guideHeroEyebrow")}</span>
          <h2>{guide.title || workspace.title}</h2>
          <p>{guide.overview}</p>
        </div>
        <div className="guide-hero-actions">
          <button type="button" className="pill light" onClick={toggleListenGuide}>
            {isSpeakingGuide ? <VolumeX size={15} /> : <Volume2 size={15} />}
            <span>{isSpeakingGuide ? t("voiceStopAudio") : t("voiceListen")}</span>
          </button>
          <button type="button" className="pill accent" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
            <span>{t("guideRefreshBtn")}</span>
          </button>
        </div>
      </div>

      {/* Learning Objectives */}
      {learningObjectives.length > 0 && (
        <section className="guide-section-card objectives-card">
          <div className="section-head">
            <span className="section-label">{t("guideObjectives")}</span>
            <button
              type="button"
              className="copy-btn"
              onClick={() => copySection("objectives", learningObjectives.join("\n"))}
            >
              <Copy size={13} /> {copiedKey === "objectives" ? t("guideCopied") : t("guideCopySection")}
            </button>
          </div>
          <div className="objectives-list">
            {learningObjectives.map((obj, i) => (
              <div key={i} className="objective-item">
                <CheckCircle2 size={16} />
                <span>{obj}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Core Concepts */}
      <section className="guide-section-card">
        <div className="section-head">
          <span className="section-label">{t("guideCoreConcepts")}</span>
          <div className="section-head-actions">
            <button
              type="button"
              className="regenerate-btn"
              disabled={regeneratingSection === "coreConcepts"}
              onClick={() => regenerateSection("coreConcepts")}
              title={t("guideRegenerateSection")}
            >
              {regeneratingSection === "coreConcepts" ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}
              <span>{t("guideRegenerateSection")}</span>
            </button>
            <button
              type="button"
              className="copy-btn"
              onClick={() =>
                copySection(
                  "concepts",
                  coreConcepts.map((c) => `${c.name || c.title}: ${c.explanation || c.detail}`).join("\n\n")
                )
              }
            >
              <Copy size={13} /> {copiedKey === "concepts" ? t("guideCopied") : t("guideCopySection")}
            </button>
          </div>
        </div>

        <div className="concepts-grid">
          {coreConcepts.map((item, index) => {
            const name = item.name || item.title || "";
            const explanation = item.explanation || item.detail || "";
            const pages = item.sourcePages || [];

            return (
              <article key={name || index} className="concept-card">
                <div className="concept-card-top">
                  <i>{String(index + 1).padStart(2, "0")}</i>
                  <h3>{name}</h3>
                </div>
                <p>{explanation}</p>
                {pages.length > 0 && (
                  <div className="concept-pages">
                    {pages.map((pg) => (
                      <span key={pg} className="page-pill">
                        <FileText size={12} /> {t("pageCitation", { page: pg })}
                      </span>
                    ))}
                  </div>
                )}
                <div className="concept-card-actions">
                  <button
                    type="button"
                    className="pill-sm"
                    onClick={() => speakText(`${name}. ${explanation}`, lang, { rate: 0.95 })}
                  >
                    <Volume2 size={12} /> {t("voiceListen")}
                  </button>
                  {onPracticeConcept && (
                    <button
                      type="button"
                      className="pill-sm"
                      onClick={() => onPracticeConcept(name)}
                    >
                      <Target size={12} /> {t("guidePracticeConcept")}
                    </button>
                  )}
                  {onAskTutorConcept && (
                    <button
                      type="button"
                      className="pill-sm"
                      onClick={() => onAskTutorConcept(`Explain "${name}" in depth with examples`)}
                    >
                      <MessageCircle size={12} /> {t("guideAskAiConcept")}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Key Definitions & Relationships */}
      <div className="guide-dual-grid">
        <section className="guide-section-card">
          <div className="section-head">
            <span className="section-label">{t("guideKeyDefs")}</span>
            <button
              type="button"
              className="regenerate-btn"
              disabled={regeneratingSection === "keyDefinitions"}
              onClick={() => regenerateSection("keyDefinitions")}
            >
              {regeneratingSection === "keyDefinitions" ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}
            </button>
          </div>
          <div className="definitions-stack">
            {keyDefinitions.map((item, idx) => (
              <div className="definition-row" key={item.term || idx}>
                <div className="def-term-badge">
                  <strong>{item.term}</strong>
                  {item.sourcePages && item.sourcePages.length > 0 && (
                    <small>p. {item.sourcePages.join(", ")}</small>
                  )}
                </div>
                <p>{item.definition || item.meaning}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Common Mistakes */}
        <section className="guide-section-card">
          <div className="section-head">
            <span className="section-label">{t("guideCommonMistakes")}</span>
            <button
              type="button"
              className="regenerate-btn"
              disabled={regeneratingSection === "commonMistakes"}
              onClick={() => regenerateSection("commonMistakes")}
            >
              {regeneratingSection === "commonMistakes" ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}
            </button>
          </div>
          {commonMistakes.length > 0 ? (
            <div className="mistakes-stack">
              {commonMistakes.map((mistake, idx) => (
                <div key={idx} className="mistake-item">
                  <span className="warning-dot">!</span>
                  <p>{mistake}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rules-stack">
              {rules.map((rule, idx) => (
                <div key={idx} className="rule-item">
                  <Sparkles size={14} />
                  <p>{rule}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Quick Recap */}
      {quickRecap.length > 0 && (
        <section className="guide-section-card revision-box">
          <div className="section-head">
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Sparkles size={15} />
              <span className="section-label">{t("guideQuickRecap")}</span>
            </div>
            <button
              type="button"
              className="copy-btn"
              onClick={() => copySection("recap", quickRecap.join("\n"))}
            >
              <Copy size={13} /> {copiedKey === "recap" ? t("guideCopied") : t("guideCopySection")}
            </button>
          </div>
          <div className="recap-list">
            {quickRecap.map((item, idx) => (
              <p key={idx}>
                <Check size={14} />
                <span>{item}</span>
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Suggested Quiz Topics */}
      {suggestedTopics.length > 0 && (
        <div className="suggested-topics-bar">
          <span className="section-label">{t("guideSuggestedTopics")}</span>
          <div className="topic-pills-row">
            {suggestedTopics.map((top, idx) => (
              <button
                key={idx}
                type="button"
                className="suggested-topic-pill"
                onClick={() => onPracticeConcept && onPracticeConcept(top)}
              >
                <Target size={13} />
                <span>{top}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Tutor = ({
  workspace,
  refresh,
  initialQuery = "",
  onClearInitialQuery,
  onPracticeTopic,
}: {
  workspace: Workspace;
  refresh: () => Promise<void>;
  initialQuery?: string;
  onClearInitialQuery?: () => void;
  onPracticeTopic?: (topic: string) => void;
}) => {
  const { t, lang } = useI18n();
  const [question, setQuestion] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [grounded, setGrounded] = useState(true);
  const [mode, setMode] = useState<"strict" | "explain">("strict");
  const [isListening, setIsListening] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const recognizerRef = useRef<any>(null);

  useEffect(() => {
    if (initialQuery) {
      setQuestion(initialQuery);
      onClearInitialQuery?.();
    }
  }, [initialQuery]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [workspace.messages.length, busy]);

  const ask = async (event?: FormEvent, customQuery?: string) => {
    if (event) event.preventDefault();
    const queryToSend = customQuery || question;
    if (!queryToSend.trim() || busy) return;

    setBusy(true);
    setQuestion("");
    stopSpeaking();
    setPlayingMsgId(null);

    try {
      await api(`/api/workspaces/${workspace.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: queryToSend, grounded, mode }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleSpeechInput = () => {
    if (isListening) {
      recognizerRef.current?.stop();
      setIsListening(false);
    } else {
      const recognizer = createSpeechRecognizer(lang, {
        onStart: () => setIsListening(true),
        onResult: (text, isFinal) => {
          setQuestion(text);
          if (isFinal) {
            setIsListening(false);
          }
        },
        onError: () => setIsListening(false),
        onEnd: () => setIsListening(false),
      });
      recognizerRef.current = recognizer;
      if (recognizer.isSupported) {
        recognizer.start();
      }
    }
  };

  const toggleSpeakMessage = (msgId: string, content: string) => {
    if (playingMsgId === msgId) {
      stopSpeaking();
      setPlayingMsgId(null);
    } else {
      stopSpeaking();
      setPlayingMsgId(msgId);
      speakText(content, lang, {
        rate: 0.95,
        onEnd: () => setPlayingMsgId(null),
      });
    }
  };

  return (
    <div className="tutor-layout">
      <div className="chat-area">
        <div className="chat-title">
          <div className="title-left">
            <span className="online-dot" />
            <span>{t("wsSourceDocs")} ({workspace.documents.length})</span>
          </div>

          <div className="chat-top-actions">
            {/* Strict Grounded vs Explain Mode */}
            <button
              type="button"
              className={`pill ${mode === "strict" ? "light" : "ghost"}`}
              onClick={() => setMode(mode === "strict" ? "explain" : "strict")}
              title={mode === "strict" ? t("groundedDescStrict") : t("groundedDescOpen")}
            >
              <Sparkles size={13} />
              <span>{mode === "strict" ? t("groundedMode") : t("openMode")}</span>
            </button>

            {/* Voice Tutor Launcher */}
            <button
              type="button"
              className="pill accent voice-header-btn"
              onClick={() => setVoiceModalOpen(true)}
              title={t("voiceModalTitle")}
            >
              <Mic size={13} />
              <span>
                {t("voiceTutorBtn") && t("voiceTutorBtn") !== "voiceTutorBtn"
                  ? t("voiceTutorBtn")
                  : lang === "ar"
                  ? "المعلم الصوتي"
                  : lang === "fr"
                  ? "Tuteur vocal"
                  : lang === "es"
                  ? "Tutor de voz"
                  : lang === "de"
                  ? "Sprach-Tutor"
                  : "Voice Tutor"}
              </span>
            </button>
          </div>
        </div>

        <div className="messages">
          {workspace.messages.length === 0 && (
            <div className="chat-welcome">
              <div>
                <Sparkles />
              </div>
              <span className="eyebrow">{t("askEyebrow")}</span>
              <h2>{t("askTitle")}</h2>
              <p>{t("askDesc")}</p>
              <div className="suggestions">
                {[t("sug1"), t("sug2"), t("sug3")].map((item) => (
                  <button key={item} onClick={() => ask(undefined, item)}>
                    {item}
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {workspace.messages.map((message, mIndex) => {
            const isLast = mIndex === workspace.messages.length - 1;
            const isAssistant = message.role === "assistant";

            return (
              <div className={`message ${message.role}`} key={message.id}>
                <div className="message-avatar">
                  {isAssistant ? <Leaf /> : t("you")}
                </div>
                <div className="message-content-wrapper">
                  <div className="message-body">
                    <FormattedMessage content={message.content} isAssistant={isAssistant} />
                    {isAssistant && (
                      <button
                        type="button"
                        className="message-audio-btn"
                        onClick={() => toggleSpeakMessage(message.id, message.content)}
                        title={playingMsgId === message.id ? t("voiceStopAudio") : t("voiceListen")}
                      >
                        {playingMsgId === message.id ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        <span>{playingMsgId === message.id ? t("voiceStopAudio") : t("voiceListen")}</span>
                      </button>
                    )}
                  </div>

                  {message.citations && message.citations.length > 0 && (
                    <div className="citations">
                      {message.citations.map((citation, index) => (
                        <details key={index}>
                          <summary>
                            <FileText size={13} /> {citation.document} · {t("pageCitation", { page: citation.page })}
                          </summary>
                          <p>{citation.excerpt}</p>
                        </details>
                      ))}
                    </div>
                  )}

                  {/* Contextual Action Pills under the latest assistant response */}
                  {isAssistant && isLast && !busy && (
                    <div className="message-action-pills">
                      <button
                        type="button"
                        className="action-pill"
                        onClick={() => ask(undefined, "Explain that simpler in plain everyday terms.")}
                      >
                        {t("tutorSimpler")}
                      </button>
                      <button
                        type="button"
                        className="action-pill"
                        onClick={() => ask(undefined, "Can you provide a concrete real-world example of this?")}
                      >
                        {t("tutorExample")}
                      </button>
                      <button
                        type="button"
                        className="action-pill"
                        onClick={() => ask(undefined, "Summarize this into 3 clear bullet points.")}
                      >
                        {t("tutorSummarize")}
                      </button>
                      <button
                        type="button"
                        className="action-pill"
                        onClick={() => ask(undefined, "Ask me a check-for-understanding question about this topic.")}
                      >
                        {t("tutorAskMe")}
                      </button>
                      {onPracticeTopic && (
                        <button
                          type="button"
                          className="action-pill accent"
                          onClick={() => onPracticeTopic("Current Topic")}
                        >
                          <Target size={12} /> {t("tutorPracticeTopic")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {busy && (
            <div className="message assistant">
              <div className="message-avatar">
                <Leaf />
              </div>
              <div className="typing">
                <i />
                <i />
                <i />
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>

        <form className="chat-input" onSubmit={ask}>
          <div className="input-bar-inner">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t("chatPlaceholder")}
              aria-label="Ask Nabta"
              disabled={busy}
            />
            <button
              type="button"
              className={`mic-input-btn ${isListening ? "listening" : ""}`}
              onClick={handleSpeechInput}
              title={t("voiceMicTooltip")}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button disabled={!question.trim() || busy} aria-label="Send">
              <Send size={16} />
            </button>
          </div>
          <small>
            <Sparkles size={12} /> {mode === "strict" ? t("groundedBadge") : t("openBadge")}
          </small>
        </form>
      </div>

      <aside className="source-rail">
        <span className="section-label">{t("wsSourceDocs")}</span>
        {workspace.documents.map((doc) => (
          <div className="source-card" key={doc.id}>
            <FileText size={18} />
            <div>
              <strong>{doc.name}</strong>
              <span>{t("wsPagesReady", { count: doc.pageCount })}</span>
            </div>
            <Check size={14} />
          </div>
        ))}

        <div className="grounding-note">
          <CircleHelp size={16} />
          <div>
            <strong>{mode === "strict" ? t("groundedMode") : t("openMode")}</strong>
            <p>{mode === "strict" ? t("groundedDescStrict") : t("groundedDescOpen")}</p>
          </div>
        </div>
      </aside>

      {/* Voice Tutor Modal */}
      <VoiceTutorModal
        workspace={workspace}
        isOpen={voiceModalOpen}
        onClose={() => {
          stopSpeaking();
          setVoiceModalOpen(false);
        }}
        onRefresh={refresh}
      />
    </div>
  );
};

const QuizView = ({
  workspace,
  refresh,
  initialTopic = "",
  onClearInitialTopic,
}: {
  workspace: Workspace;
  refresh: () => Promise<void>;
  initialTopic?: string;
  onClearInitialTopic?: () => void;
}) => {
  const { t, lang } = useI18n();
  const [activeView, setActiveView] = useState<"library" | "taking" | "result">("library");
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (initialTopic) {
      setModalOpen(true);
      onClearInitialTopic?.();
    }
  }, [initialTopic]);

  const handleStartQuiz = (quiz: Quiz) => {
    setSelectedQuiz(quiz);
    setAnswers({});
    setResult(null);
    setActiveView("taking");
  };

  const handlePracticeWeakTopics = async () => {
    setBusy(true);
    try {
      const created = await api<Quiz>(`/api/workspaces/${workspace.id}/quizzes/weak-topics`, {
        method: "POST",
      });
      await refresh();
      handleStartQuiz(created);
    } catch (err: any) {
      alert(err.message || "Failed to generate weak topics quiz");
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicateQuiz = async (quizId: string) => {
    try {
      await api(`/api/workspaces/${workspace.id}/quizzes/${quizId}/duplicate`, {
        method: "POST",
      });
      await refresh();
    } catch (err: any) {
      alert(err.message || "Failed to duplicate quiz");
    }
  };

  const handleRenameQuiz = async (quiz: Quiz) => {
    const newTitle = window.prompt(t("quizRenamePrompt"), quiz.title);
    if (!newTitle || newTitle === quiz.title) return;

    try {
      await api(`/api/workspaces/${workspace.id}/quizzes/${quiz.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      await refresh();
    } catch (err: any) {
      alert(err.message || "Failed to rename quiz");
    }
  };

  const handleDeleteQuiz = async (quiz: Quiz) => {
    if (!window.confirm(t("quizDeleteConfirmMsg"))) return;
    try {
      await api(`/api/workspaces/${workspace.id}/quizzes/${quiz.id}`, {
        method: "DELETE",
      });
      await refresh();
      if (selectedQuiz?.id === quiz.id) {
        setSelectedQuiz(null);
        setActiveView("library");
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete quiz");
    }
  };

  const handleSubmitQuiz = async () => {
    if (!selectedQuiz) return;
    setBusy(true);
    try {
      const attempt = await api<Attempt>(
        `/api/workspaces/${workspace.id}/quizzes/${selectedQuiz.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        }
      );
      setResult(attempt);
      setActiveView("result");
      await refresh();
    } catch (err: any) {
      alert(err.message || "Failed to submit quiz");
    } finally {
      setBusy(false);
    }
  };

  const handleRetryIncorrectOnly = () => {
    if (!selectedQuiz || !result) return;
    const incorrectIds = result.results.filter((r) => !r.correct).map((r) => r.questionId);
    const retryQuestions = selectedQuiz.questions.filter((q) => incorrectIds.includes(q.id));

    if (retryQuestions.length === 0) {
      alert("Congratulations! All questions were correct on this attempt.");
      return;
    }

    const retryQuiz: Quiz = {
      ...selectedQuiz,
      questions: retryQuestions,
      title: `${selectedQuiz.title} (Retry Incorrect)`,
    };
    setSelectedQuiz(retryQuiz);
    setAnswers({});
    setResult(null);
    setActiveView("taking");
  };

  // 1. Result View
  if (activeView === "result" && result && selectedQuiz) {
    return (
      <div className="quiz-result-view">
        <div className="result-score-hero">
          <div className="hero-left">
            <span className="eyebrow">{t("quizCompleteTitle")}</span>
            <h2>{selectedQuiz.title}</h2>
            <div className="scores-row">
              <div className="score-badge main">
                <span>{t("quizScoreLabel")}</span>
                <strong>{result.score}%</strong>
              </div>
              {result.mcqScore !== undefined && selectedQuiz.questionType !== "essay" && (
                <div className="score-badge secondary">
                  <span>MCQ</span>
                  <strong>{result.mcqScore}%</strong>
                </div>
              )}
              {result.essayScore !== undefined && selectedQuiz.questionType !== "mcq" && (
                <div className="score-badge secondary">
                  <span>Essay</span>
                  <strong>{result.essayScore}%</strong>
                </div>
              )}
            </div>
          </div>
          <div className="hero-right-actions">
            <button
              type="button"
              className="dark-button"
              onClick={handleRetryIncorrectOnly}
            >
              <RotateCcw size={15} />
              <span>{t("quizRetryIncorrect")}</span>
            </button>
            <button
              type="button"
              className="subtle-button"
              onClick={() => {
                setActiveView("library");
                setSelectedQuiz(null);
                setResult(null);
              }}
            >
              <span>{t("quizBackToLibrary")}</span>
            </button>
          </div>
        </div>

        <div className="result-questions-list">
          <span className="section-label">{t("quizReviewAnswers")}</span>
          {selectedQuiz.questions.map((q, idx) => {
            const grade = result.results.find((r) => r.questionId === q.id);
            const isCorrect = grade?.correct;
            const essayGrade = grade?.essayGrade;

            return (
              <article key={q.id} className={`result-question-card ${isCorrect ? "correct" : "incorrect"}`}>
                <div className="card-top">
                  <div className="question-idx-badge">
                    {isCorrect ? <Check size={14} /> : <X size={14} />}
                    <span>{t("quizQuestionHeader", { current: idx + 1, total: selectedQuiz.questions.length })}</span>
                  </div>
                  <div className="badge-row">
                    <span className="pill-sm">{q.type === "mcq" ? t("quizTypeBadgeMcq") : t("quizTypeBadgeEssay")}</span>
                    {q.topic && <span className="pill-sm">{q.topic}</span>}
                    {q.sourcePage && (
                      <span className="pill-sm">
                        <FileText size={11} /> {t("pageCitation", { page: q.sourcePage })}
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="question-title">{q.question}</h3>

                {/* MCQ Feedback */}
                {q.type === "mcq" && (
                  <div className="mcq-feedback-body">
                    <p className="student-answer">
                      <strong>Your Answer:</strong> {answers[q.id] || "No answer provided"}
                    </p>
                    {!isCorrect && (
                      <p className="correct-answer">
                        <strong>{t("quizCorrectAnswer")}</strong> {grade?.correctAnswer || q.correctAnswer}
                      </p>
                    )}
                    <p className="explanation-text">
                      <strong>{t("quizExplanation")}</strong> {grade?.feedback || q.explanation}
                    </p>
                  </div>
                )}

                {/* Essay Deep Rubric Feedback */}
                {q.type !== "mcq" && (
                  <div className="essay-rubric-body">
                    <p className="student-essay">
                      <strong>Your Answer:</strong> {answers[q.id] || "No answer provided"}
                    </p>

                    {essayGrade && (
                      <div className="rubric-breakdown">
                        <div className="rubric-score-badge">
                          <span>Conceptual Score: </span>
                          <strong>{essayGrade.score}/100</strong>
                        </div>

                        {essayGrade.correctPoints?.length > 0 && (
                          <div className="rubric-point-section positive">
                            <strong>{t("quizCorrectPoints")}</strong>
                            <ul>
                              {essayGrade.correctPoints.map((pt, pIdx) => (
                                <li key={pIdx}>+ {pt}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {essayGrade.missingPoints?.length > 0 && (
                          <div className="rubric-point-section warning">
                            <strong>{t("quizMissingPoints")}</strong>
                            <ul>
                              {essayGrade.missingPoints.map((pt, pIdx) => (
                                <li key={pIdx}>- {pt}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {essayGrade.incorrectClaims?.length > 0 && (
                          <div className="rubric-point-section negative">
                            <strong>{t("quizIncorrectClaims")}</strong>
                            <ul>
                              {essayGrade.incorrectClaims.map((pt, pIdx) => (
                                <li key={pIdx}>! {pt}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <p className="qualitative-feedback">
                          <strong>{t("quizExplanation")}</strong> {essayGrade.feedback}
                        </p>

                        {essayGrade.improvedAnswer && (
                          <div className="improved-answer-box">
                            <strong>{t("quizImprovedAnswer")}</strong>
                            <p>{essayGrade.improvedAnswer}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  // 2. Taking View
  if (activeView === "taking" && selectedQuiz) {
    const answeredCount = Object.keys(answers).filter((k) => answers[k]?.trim()).length;

    return (
      <div className="quiz-taking-view">
        <div className="taking-header">
          <div className="taking-header-left">
            <button
              type="button"
              className="taking-back-btn"
              onClick={() => setActiveView("library")}
              title={t("quizBackToLibrary")}
            >
              <ArrowLeft size={16} />
              <span>{t("quizBackToLibrary")}</span>
            </button>
            <div className="taking-header-titles">
              <span className="eyebrow">{selectedQuiz.title}</span>
              <h2>{selectedQuiz.topic || t("quizTitle")}</h2>
            </div>
          </div>
          <div className="taking-progress-badge">
            <span>
              {answeredCount} / {selectedQuiz.questions.length} answered
            </span>
          </div>
        </div>

        <div className="questions-container">
          {selectedQuiz.questions.map((question, index) => {
            const isMcq = question.type === "mcq";

            return (
              <article className="taking-question-card" key={question.id}>
                <div className="question-card-meta">
                  <div className="index-pill">{String(index + 1).padStart(2, "0")}</div>
                  <div className="tag-row">
                    <span className="pill-sm">{isMcq ? t("quizTypeBadgeMcq") : t("quizTypeBadgeEssay")}</span>
                    {question.topic && <span className="pill-sm">{question.topic}</span>}
                    {question.sourcePage && (
                      <span className="pill-sm">
                        <FileText size={11} /> {t("pageCitation", { page: question.sourcePage })}
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="question-text">{question.question}</h3>

                {isMcq ? (
                  <div className="mcq-options-grid">
                    {question.options?.map((option, optIdx) => {
                      const optionText = typeof option === "string" ? option : option.text;
                      const optionKey = typeof option === "string" ? String.fromCharCode(65 + optIdx) : option.id;
                      const isSelected = answers[question.id] === optionKey || answers[question.id] === optionText;

                      return (
                        <label
                          key={optionKey || optIdx}
                          className={`mcq-option-label ${isSelected ? "selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name={`q_${question.id}`}
                            checked={isSelected}
                            onChange={() =>
                              setAnswers({ ...answers, [question.id]: optionKey })
                            }
                          />
                          <span className="opt-letter">{String.fromCharCode(65 + optIdx)}</span>
                          <span className="opt-text">{optionText}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="essay-answer-area">
                    <textarea
                      rows={4}
                      value={answers[question.id] || ""}
                      onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                      placeholder={t("quizShortPlaceholder")}
                    />
                    {question.rubric && question.rubric.length > 0 && (
                      <div className="rubric-criteria-hint">
                        <span>{t("quizRubricCriteria")} </span>
                        {question.rubric.map((r, rIdx) => (
                          <small key={rIdx}>{r.criterion} · </small>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <div className="taking-footer">
          <button
            type="button"
            className="subtle-button"
            onClick={() => setActiveView("library")}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className="primary-submit"
            onClick={handleSubmitQuiz}
            disabled={busy || answeredCount === 0}
          >
            {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            <span>{busy ? t("quizSubmitting") : t("quizSubmitBtn")}</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. Library View (Default)
  const quizzes = workspace.quizzes || [];

  return (
    <div className="quiz-library-view">
      <div className="library-top-bar">
        <div>
          <span className="eyebrow">{t("quizEyebrow")}</span>
          <h2>{t("quizHubTitle")}</h2>
          <p>{t("quizHubSub")}</p>
        </div>
        <div className="top-bar-buttons">
          <button
            type="button"
            className="pill light"
            onClick={handlePracticeWeakTopics}
            disabled={busy}
          >
            <Sparkles size={14} />
            <span>{t("quizWeakPracticeBtn")}</span>
          </button>
          <button
            type="button"
            className="pill accent"
            onClick={() => setModalOpen(true)}
          >
            <Plus size={14} />
            <span>{t("quizCreateNewBtn")}</span>
          </button>
        </div>
      </div>

      {quizzes.length === 0 ? (
        <div className="panel-empty">
          <div className="line-icon">
            <Target />
          </div>
          <span className="eyebrow">{t("quizEyebrow")}</span>
          <h2>{t("quizTitle")}</h2>
          <p>{t("quizDesc")}</p>
          <button className="dark-button" onClick={() => setModalOpen(true)}>
            <Plus size={16} /> {t("quizCreateNewBtn")}
          </button>
        </div>
      ) : (
        <div className="quiz-cards-grid">
          {quizzes.map((q) => {
            const hasScore = q.bestScore !== undefined && q.bestScore !== null;

            return (
              <div className="quiz-card" key={q.id}>
                <div className="quiz-card-head">
                  <div className="quiz-num-title">
                    <span className="quiz-num">Quiz #{q.quizNumber}</span>
                    <h3>{q.title}</h3>
                  </div>
                  <div className="quiz-score-indicator">
                    {hasScore ? (
                      <span className={`score-badge ${q.bestScore! >= 70 ? "good" : ""}`}>
                        {q.bestScore}%
                      </span>
                    ) : (
                      <span className="not-attempted">{t("quizCardNotAttempted")}</span>
                    )}
                  </div>
                </div>

                <div className="quiz-card-tags">
                  <span className="pill-sm">{q.questionType?.toUpperCase() || "MCQ"}</span>
                  <span className="pill-sm">{q.difficulty}</span>
                  <span className="pill-sm">{t("quizCardQuestions", { count: q.questionCount || q.questions?.length || 5 })}</span>
                  {q.topic && <span className="pill-sm topic-tag">{q.topic}</span>}
                </div>

                <div className="quiz-card-footer">
                  <div className="quiz-attempts-info">
                    {q.attemptsCount ? (
                      <small>
                        <History size={12} /> {q.attemptsCount} attempts
                      </small>
                    ) : (
                      <small>{t("quizCardNotAttempted")}</small>
                    )}
                  </div>

                  <div className="quiz-card-actions">
                    <button
                      type="button"
                      className="quiz-action-primary"
                      onClick={() => handleStartQuiz(q)}
                    >
                      <Play size={13} />
                      <span>{hasScore ? t("quizActionRetry") : t("quizActionStart")}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleRenameQuiz(q)}
                      title={t("quizActionRename")}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleDuplicateQuiz(q.id)}
                      title={t("quizActionDuplicate")}
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => handleDeleteQuiz(q)}
                      title={t("quizActionDelete")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quiz Modal */}
      <QuizModal
        workspace={workspace}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onQuizCreated={(newQuiz) => {
          handleStartQuiz(newQuiz);
        }}
      />
    </div>
  );
};

const Progress = ({
  workspace,
  onOpenTutorWithQuery,
  onOpenQuizWithTopic,
  onStartViva,
}: {
  workspace: Workspace;
  onOpenTutorWithQuery?: (query: string) => void;
  onOpenQuizWithTopic?: (topic: string) => void;
  onStartViva?: () => void;
}) => {
  const { t, lang } = useI18n();
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const concepts = workspace.concepts || [];
  const attempts = workspace.attempts || [];
  const nba = workspace.nextBestAction;

  const average = attempts.length
    ? Math.round(attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length)
    : workspace.overallMastery || 0;

  const handleExecuteNextBestAction = () => {
    if (!nba) return;
    if (nba.type === "viva") {
      onStartViva?.();
    } else if (nba.type === "quiz") {
      onOpenQuizWithTopic?.(nba.concept);
    } else if (nba.type === "tutor") {
      onOpenTutorWithQuery?.(`Explain ${nba.concept} in detail with examples`);
    } else if (nba.type === "review") {
      const pageNum = nba.sourcePages?.[0] || 1;
      onOpenTutorWithQuery?.(`Explain page ${pageNum} in depth`);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "weak":
        return "status-weak";
      case "learning":
        return "status-learning";
      case "good":
        return "status-good";
      case "strong":
        return "status-strong";
      default:
        return "";
    }
  };

  return (
    <div className="progress-view">
      {/* Next Best Action Card */}
      {nba && (
        <section className="nba-hero-card">
          <div className="nba-top-row">
            <span className="nba-kicker">
              <Sparkles size={14} /> {t("nbaTitle")}
            </span>
            <span className="nba-time-pill">
              <Clock3 size={13} /> {t("nbaEstMinutes", { min: nba.estimatedMinutes || 7 })}
            </span>
          </div>

          <div className="nba-body">
            <div className="nba-icon-box">
              <Target size={24} />
            </div>
            <div className="nba-text">
              <h3>{nba.concept}</h3>
              <p>{nba.reason}</p>
            </div>
            <button
              type="button"
              className="nba-cta-button"
              onClick={handleExecuteNextBestAction}
            >
              <span>{t("nbaStartNow")}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {/* Progress Metrics Overview */}
      <div className="progress-metrics">
        <div>
          <span>{t("progMastery")}</span>
          <strong>{average}%</strong>
          <div className="meter">
            <i style={{ width: `${average}%` }} />
          </div>
        </div>
        <div>
          <span>{t("progConceptsCount", { count: concepts.length })}</span>
          <strong>{concepts.length}</strong>
          <small>
            {workspace.masteryCounts?.weak || 0} weak · {workspace.masteryCounts?.strong || 0} strong
          </small>
        </div>
        <div>
          <span>{t("progQuizzesDone")}</span>
          <strong>{attempts.length}</strong>
          <small>{attempts.length ? t("progQuizSharpens") : t("progQuizEmpty")}</small>
        </div>
        <div>
          <span>{t("progCoverage")}</span>
          <strong>{workspace.documents[0]?.pageCount || 0}</strong>
          <small>{t("progPagesReady", { count: workspace.documents[0]?.pageCount || 0 })}</small>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="progress-action-toolbar">
        <button
          type="button"
          className="pill light"
          onClick={() => onOpenQuizWithTopic?.(workspace.weakTopics?.[0] || "")}
        >
          <Sparkles size={14} />
          <span>{t("weakTopicsPracticeBtn")}</span>
        </button>
        <button
          type="button"
          className="pill accent"
          onClick={() => onStartViva?.()}
        >
          <Award size={14} />
          <span>{t("vivaBtn")}</span>
        </button>
      </div>

      {/* Concept Mastery Cards Grid */}
      <section className="mastery-map-section">
        <span className="section-label">{t("progEyebrow")}</span>
        <div className="concepts-mastery-grid">
          {concepts.map((c) => (
            <div
              key={c.id}
              className="concept-mastery-card"
              onClick={() => {
                setSelectedConcept(c);
                setDrawerOpen(true);
              }}
            >
              <div className="card-header">
                <h4>{c.name}</h4>
                <span className={`status-pill ${getStatusBadgeClass(c.masteryStatus)}`}>
                  {c.masteryScore}%
                </span>
              </div>
              <p className="card-desc">{c.description}</p>
              <div className="card-bar">
                <i className={getStatusBadgeClass(c.masteryStatus)} style={{ width: `${c.masteryScore}%` }} />
              </div>
              {c.sourcePages?.length > 0 && (
                <div className="card-pages">
                  <FileText size={11} /> {t("masteryDetailPages", { pages: c.sourcePages.join(", ") })}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Recent Scores & Activity */}
      <div className="progress-grid">
        <section>
          <span className="section-label">{t("progRecentScores")}</span>
          {attempts.length ? (
            <div className="score-history">
              {attempts.slice(-6).map((attempt) => (
                <div key={attempt.id}>
                  <span>
                    {new Date(attempt.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <i style={{ height: `${Math.max(attempt.score, 8)}%` }} />
                  <strong>{attempt.score}%</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="small-empty">
              <BarChart3 />
              <p>{t("progNoScoresYet")}</p>
            </div>
          )}
        </section>

        {workspace.weakTopics?.length > 0 && (
          <aside>
            <span className="section-label">{t("progTopicsToStrengthen")}</span>
            <div className="weak-topics-pills">
              {workspace.weakTopics.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  className="weak-topic-pill"
                  onClick={() => onOpenQuizWithTopic?.(topic)}
                >
                  <span>{topic}</span>
                  <Target size={13} />
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Concept Drawer */}
      <ConceptDrawer
        concept={selectedConcept}
        workspace={workspace}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onPractice={(conceptName) => onOpenQuizWithTopic?.(conceptName)}
        onAskTutor={(conceptName) => onOpenTutorWithQuery?.(`Explain "${conceptName}" in detail`)}
      />
    </div>
  );
};


const AccountPage = () => {
  const { t, lang, setLang } = useI18n();
  const [account, setAccount] = useState<Account | null>(null);
  const [form, setForm] = useState({
    displayName: "",
    fieldOfStudy: "",
    studyLevel: "",
    dailyGoal: 30,
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Account>("/api/account")
      .then((data) => {
        setAccount(data);
        setForm({
          displayName: data.displayName || data.googleName,
          fieldOfStudy: data.fieldOfStudy || "",
          studyLevel: data.studyLevel || "",
          dailyGoal: data.dailyGoal || 30,
        });
      })
      .catch((err) => setError(err.message));
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const updated = await api<Account>("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setAccount(updated);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/app";
  };
  if (!account)
    return (
      <div className="full-loader">
        <Leaf />
        <Loader2 className="spin" />
        <span>{t("loading")}</span>
      </div>
    );
  return (
    <div className="app-shell">
      <AppSidebar active="account" />
      <main className="account-main">
        <header className="account-header">
          <div>
            <span className="eyebrow">{t("acctEyebrow")}</span>
            <h1>{t("acctTitle")}</h1>
            <p>Google gets you in. This profile makes Nabta yours.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <LanguageSwitcher variant="header" />
            <button className="account-back" onClick={() => navigate("/app")}>
              <ArrowLeft /> {t("back")}
            </button>
          </div>
        </header>
        <div className="account-grid">
          <aside className="account-summary">
            <div className="account-avatar">
              {account.picture ? (
                <img
                  src={account.picture}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Leaf />
              )}
            </div>
            <h2>{account.displayName || account.googleName}</h2>
            <p>{account.email || t("localGuest")}</p>
            <span>
              Member since{" "}
              {new Date(account.joinedAt).toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </span>
            <div className="account-secure">
              <Check />
              <div>
                <strong>Google verified</strong>
                <small>Your sign-in identity is securely connected.</small>
              </div>
            </div>
          </aside>
          <form className="account-form" onSubmit={save}>
            <div className="form-heading">
              <span className="eyebrow">{t("acctEyebrow")}</span>
              <h2>{t("acctTitle")}</h2>
            </div>
            <label>
              {t("acctName")}
              <input
                value={form.displayName}
                onChange={(event) =>
                  setForm({ ...form, displayName: event.target.value })
                }
                placeholder="What should Nabta call you?"
              />
            </label>
            <div className="account-form-row">
              <label>
                Field of study
                <input
                  value={form.fieldOfStudy}
                  onChange={(event) =>
                    setForm({ ...form, fieldOfStudy: event.target.value })
                  }
                  placeholder="e.g. Computer Science"
                />
              </label>
              <label>
                Study level
                <select
                  value={form.studyLevel}
                  onChange={(event) =>
                    setForm({ ...form, studyLevel: event.target.value })
                  }
                >
                  <option value="">Choose level</option>
                  <option>Secondary school</option>
                  <option>Undergraduate</option>
                  <option>Postgraduate</option>
                  <option>Professional learning</option>
                </select>
              </label>
            </div>
            <label>
              Daily focus goal
              <div className="goal-options">
                {[20, 30, 45, 60].map((minutes) => (
                  <button
                    type="button"
                    className={form.dailyGoal === minutes ? "active" : ""}
                    onClick={() => setForm({ ...form, dailyGoal: minutes })}
                    key={minutes}
                  >
                    {minutes}
                    <small>min</small>
                  </button>
                ))}
              </div>
            </label>
            <label>
              {t("acctLang")}
              <div style={{ marginTop: "6px" }}>
                <LanguageSwitcher variant="header" />
              </div>
            </label>
            {error && <div className="form-error">{error}</div>}
            {saved && (
              <div className="save-success">
                <Check /> {t("saved")}
              </div>
            )}
            <div className="account-actions">
              <button className="save-account" disabled={busy}>
                {busy ? <Loader2 className="spin" /> : <Check />} {t("acctSaveBtn")}
              </button>
              <button type="button" className="logout-account" onClick={logout}>
                <LogOut /> {t("acctSignOut")}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

const StudyWorkspace = ({ id }: { id: string }) => {
  const { t } = useI18n();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tab, setTab] = useState("tutor");
  const [loading, setLoading] = useState(true);
  const [pendingTutorQuery, setPendingTutorQuery] = useState("");
  const [pendingQuizTopic, setPendingQuizTopic] = useState("");
  const [vivaModalOpen, setVivaModalOpen] = useState(false);

  const refresh = async () => {
    const data = await api<Workspace>(`/api/workspaces/${id}`);
    setWorkspace(data);
  };
  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [id]);
  if (loading || !workspace)
    return (
      <div className="full-loader">
        <Leaf />
        <Loader2 className="spin" />
        <span>{t("wsPreparing")}</span>
      </div>
    );
  const tabs = [
    { id: "tutor", label: t("tabTutor"), icon: MessageCircle },
    { id: "guide", label: t("tabGuide"), icon: BookOpen },
    { id: "quiz", label: t("tabQuiz"), icon: Target },
    { id: "progress", label: t("tabProgress"), icon: BarChart3 },
  ];

  const handleOpenTutorWithQuery = (query: string) => {
    setPendingTutorQuery(query);
    setTab("tutor");
  };

  const handleOpenQuizWithTopic = (topic: string) => {
    setPendingQuizTopic(topic);
    setTab("quiz");
  };

  return (
    <div className="study-shell">
      <AppSidebar active={tab} onTabChange={setTab} />
      <main className="study-main">
        <header className="study-header">
          <button className="back-button" onClick={() => navigate("/app")}>
            <ArrowLeft />
          </button>
          <div>
            <span className="eyebrow">{t("wsEyebrow")}</span>
            <h1>{workspace.title}</h1>
            <p>
              <FileText /> {workspace.documents[0]?.name} ·{" "}
              {t("pagesCount", { count: workspace.documents[0]?.pageCount || 1 })}
            </p>
          </div>
          <div className="header-actions" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
            <LanguageSwitcher variant="header" />
            <button
              className="subtle-button"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-text-dim)" }}
              onClick={async () => {
                if (window.confirm(t("wsDeleteConfirm"))) {
                  await api(`/api/workspaces/${workspace.id}`, { method: "DELETE" });
                  navigate("/app");
                }
              }}
            >
              <Trash2 size={16} /> {t("wsDelete")}
            </button>
          </div>
        </header>
        <nav className="study-tabs">
          {tabs.map(({ id: item, label, icon: Icon }) => (
            <button
              data-tab={item}
              className={tab === item ? "active" : ""}
              key={item}
              onClick={() => setTab(item)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <div className="study-content">
          {tab === "tutor" && (
            <Tutor
              workspace={workspace}
              refresh={refresh}
              initialQuery={pendingTutorQuery}
              onClearInitialQuery={() => setPendingTutorQuery("")}
              onPracticeTopic={(topic) => handleOpenQuizWithTopic(topic)}
            />
          )}
          {tab === "guide" && (
            <StudyGuide
              workspace={workspace}
              refresh={refresh}
              onPracticeConcept={(concept) => handleOpenQuizWithTopic(concept)}
              onAskTutorConcept={(query) => handleOpenTutorWithQuery(query)}
            />
          )}
          {tab === "quiz" && (
            <QuizView
              workspace={workspace}
              refresh={refresh}
              initialTopic={pendingQuizTopic}
              onClearInitialTopic={() => setPendingQuizTopic("")}
            />
          )}
          {tab === "progress" && (
            <Progress
              workspace={workspace}
              onOpenTutorWithQuery={handleOpenTutorWithQuery}
              onOpenQuizWithTopic={handleOpenQuizWithTopic}
              onStartViva={() => setVivaModalOpen(true)}
            />
          )}
        </div>
      </main>

      {/* Global Viva Oral Exam Modal */}
      <VivaModal
        workspace={workspace}
        isOpen={vivaModalOpen}
        onClose={() => setVivaModalOpen(false)}
        onRefresh={refresh}
      />
    </div>
  );
};
function App() {
  const path = usePath();
  let page: React.ReactNode = <Landing />;
  if (path === "/app" || path === "/dashboard")
    page = (
      <AuthBoundary>
        <Dashboard />
      </AuthBoundary>
    );
  else if (path === "/account")
    page = (
      <AuthBoundary>
        <AccountPage />
      </AuthBoundary>
    );
  else if (path.startsWith("/study/"))
    page = (
      <AuthBoundary>
        <StudyWorkspace id={path.split("/")[2]} />
      </AuthBoundary>
    );
  return (
    <I18nProvider>
      <ErrorBoundary>{page}</ErrorBoundary>
    </I18nProvider>
  );
}
export default App;
