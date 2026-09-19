# Nabta AI (نبتة) — Hackathon-Grade Adaptive Learning Platform

Nabta AI is a state-of-the-art adaptive learning platform powered by Google Gemini. It converts uploaded academic lecture notes and PDFs into a hyper-personalized, grounded study environment with a grounded AI Tutor, structured Study Guides, an adaptive Quiz Engine with rubric grading, Voice Tutor, Viva Oral Examination, and an Adaptive Learning Twin with concept mastery tracking.

---

## 🌟 Key Features

### 1. High-Fidelity Document Processing & Page-Aware RAG
- **Clean Ingestion**: Automated sanitization removing repeated headers, footers, lecture metadata, and watermarks while strictly preserving page boundaries and formatting.
- **Page-Specific Retrieval**: Direct natural queries like *"Explain page 5"* or *"اشرح الصفحة الخامسة"* isolate chunks specifically belonging to that page with zero hallucination.
- **Strictly Grounded Citations**: Structured metadata citations linking directly to exact document names and page numbers (`lecture2.pdf — Page 5`).
- **Hybrid Retrieval**: Combines semantic embeddings (`gemini-embedding-001`) with exact lexical matching for acronyms, terms, and page numbers.

### 2. Structured Study Guide
- Generated via Gemini structured JSON output adhering to an exhaustive pedagogical schema:
  - Subject Title & Overview
  - Learning Objectives
  - Core Concepts (with source page references)
  - Key Definitions & Formulas / Golden Rules
  - Important Relationships & Common Student Mistakes
  - Quick Memory Recaps & Suggested Quiz Topics
- Interactive UI cards with Section Regeneration, Copying, Spoken Audio playback, and instant "Practice this concept" navigation.

### 3. Grounded AI Tutor & Voice Tutor
- **Dual Modes**: *Strict Grounded Mode* (answers solely from uploaded material) vs. *Explain Mode* (incorporates accessible analogies while distinguishing source grounding).
- **Interactive Action Pills**: *"Explain simpler"*, *"Give example"*, *"Summarize"*, *"Ask me a question"*, *"Add to Study Guide"*, *"Practice this topic"*.
- **Voice Tutor**: Full speech-to-text input and spoken vocal explanations in fluent Modern Arabic or English with real-time waveform visualizers and speech speed controls.

### 4. Viva Oral Examination Mode
- Simulates a rigorous academic oral viva voce exam with a Gemini examiner.
- Multi-turn conversational questions that adaptively probe conceptual depths.
- Comprehensive final evaluation: Oral mastery score (0-100), key strengths, missing points, and direct live updates to the student's Mastery Map.

### 5. Quiz Management System & Rubric Grading
- **Persistent Monotonic Numbering**: Quizzes are numbered strictly per notebook (`Quiz #1`, `Quiz #2`, `Quiz #3`). Deleting `Quiz #2` leaves `#1` and `#3` untouched, and the next generated quiz is automatically `Quiz #4`.
- **Question Types**:
  - **MCQ**: 4 plausible options, single unambiguous correct answer, and pedagogical explanations.
  - **Essay / Short Answer**: Evaluated against weighted criteria rubrics (`score`, `correctPoints`, `missingPoints`, `incorrectClaims`, `feedback`, `improvedAnswer`).
  - **Mixed**: User-configurable MCQ to Essay ratio (e.g., 70% MCQ / 30% Essay).
- **Quiz Library**: Cards grid with attempt histories (e.g. Attempt 1: 52%, Attempt 2: 74%), Best score tracking, Retry incorrect questions only, Rename, Duplicate, and Delete with confirmation modal.

### 6. Adaptive Learning Twin & Mastery Map
- Extracts atomic knowledge concepts upon document ingestion.
- Maintains dynamic mastery scores (0-100: *Weak*, *Learning*, *Good*, *Strong*).
- Updates scores with persistent evidence logs (+12 / -8 delta per question performance).
- **Your Next Best Action**: A prominent recommendation card identifying the highest-leverage next study action (review pages, take mini-quiz, or practice viva).
- **Practice My Weak Topics**: One-click targeted remedial mini-quiz targeting the student's weakest concepts.

---

## 🚀 Getting Started

### Requirements
- Node.js 20+
- Modern browser with Web Speech API support (Chrome, Edge, Safari)

### Installation

```bash
git clone <repo-url>
cd mainframe-landing
npm install
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173`.

### Environment Configuration

In `.env`:
```env
# Gemini API Key (Server-side only — never exposed to client)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_CHAT_MODEL=gemini-3.5-flash
GEMINI_MODEL=gemini-3.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_LIVE_MODEL=gemini-2.0-flash-exp

# Google OAuth Web Client ID (Optional; guest mode enabled by default)
GOOGLE_CLIENT_ID=
SESSION_SECRET=a-long-random-production-secret
```

---

## 🧪 Verification & Testing

Run unit tests and production builds:

```bash
npm test        # Runs all unit tests (PDF clean, chunking, page-aware RAG, monotonic quiz numbering)
npm run check   # Runs full test suite + TypeScript type checking + Vite production build
```

---

## 🎨 Visual Identity
Preserves the signature Nabta AI aesthetic:
- Deep forest greens (`#1a382c`, `#224838`)
- Warm cream parchment background (`#faf9f5`)
- Emerald and amber accent pills
- Full RTL and LTR support with localized Modern Arabic and English typography.
