export type Citation = { document: string; page: number; excerpt: string };

export type DocumentItem = {
  id: string;
  name: string;
  status: string;
  pageCount: number;
  size: number;
  uploadedAt: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

export type GuideConcept = {
  name: string;
  explanation: string;
  sourcePages?: number[];
  title?: string;
  detail?: string;
};

export type GuideDefinition = {
  term: string;
  definition?: string;
  meaning?: string;
  sourcePages?: number[];
};

export type Guide = {
  content: {
    title?: string;
    overview: string;
    learningObjectives?: string[];
    coreConcepts: GuideConcept[];
    keyDefinitions: GuideDefinition[];
    importantRelationships?: string[];
    formulasOrRules?: string[];
    commonMistakes?: string[];
    quickRecap?: string[];
    suggestedQuizTopics?: string[];
    // Legacy fallbacks
    concepts?: { title: string; detail: string }[];
    definitions?: { term: string; meaning: string }[];
    revision?: string[];
  };
};

export type RubricItem = {
  criterion: string;
  weight: number;
};

export type QuestionOption = {
  id: string;
  text: string;
};

export type Question = {
  id: string;
  type: "mcq" | "essay" | "short";
  topic: string;
  question: string;
  options?: (string | QuestionOption)[];
  correctAnswer?: string;
  rubric?: RubricItem[];
  explanation?: string;
  sourceChunkIds?: string[];
  sourcePage?: number;
};

export type Quiz = {
  id: string;
  notebookId?: string;
  quizNumber: number;
  title: string;
  questionType: "mcq" | "essay" | "mixed";
  difficulty: "easy" | "medium" | "hard" | "adaptive";
  questionCount: number;
  topic: string;
  status?: string;
  createdAt: string;
  attemptsCount?: number;
  bestScore?: number | null;
  lastScore?: number | null;
  lastAttemptAt?: string | null;
  questions: Question[];
};

export type EssayGrade = {
  score: number;
  correctPoints: string[];
  missingPoints: string[];
  incorrectClaims: string[];
  feedback: string;
  improvedAnswer: string;
  sourceChunkIds?: string[];
};

export type AttemptResult = {
  questionId: string;
  type?: "mcq" | "essay";
  correct: boolean;
  score?: number;
  userAnswer?: string;
  correctAnswer?: string;
  feedback: string;
  essayGrade?: EssayGrade;
  sourcePage?: number;
};

export type Attempt = {
  id: string;
  quizId?: string;
  score: number;
  mcqScore?: number;
  essayScore?: number;
  weakTopics: string[];
  createdAt: string;
  results: AttemptResult[];
};

export type Concept = {
  id: string;
  name: string;
  parentConceptId?: string | null;
  description: string;
  sourcePages: number[];
  masteryScore: number;
  masteryStatus: "weak" | "learning" | "good" | "strong";
  lastUpdated?: string;
};

export type MasteryEvidence = {
  id: string;
  conceptId: string;
  conceptName: string;
  sourceType: string;
  sourceId: string;
  scoreDelta: number;
  reason: string;
  createdAt: string;
};

export type NextBestAction = {
  type: "review" | "quiz" | "tutor" | "viva";
  concept: string;
  reason: string;
  sourcePages: number[];
  estimatedMinutes: number;
};

export type VivaAttempt = {
  id: string;
  score: number;
  topic: string;
  conceptBreakdown: Record<string, number>;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
  createdAt: string;
};

export type ContentBlockType =
  | 'heading'
  | 'subheading'
  | 'paragraph'
  | 'bullet'
  | 'table'
  | 'code'
  | 'equation'
  | 'definition'
  | 'diagram';

export type ContentBlock = {
  id: string;
  page: number;
  type: ContentBlockType;
  title?: string;
  content: string;
  items?: string[];
  tableData?: { headers: string[]; rows: string[][] };
  isKeyTerm?: boolean;
  term?: string;
  uncertain?: boolean;
  metadata?: Record<string, any>;
};

export type SemanticTopic = {
  id: string;
  title: string;
  description: string;
  sourcePages: number[];
  subtopics: string[];
  keyTerms: string[];
  prerequisites: string[];
  order: number;
  blockIds: string[];
  allocatedSheets?: number;
};

export type StudySheetTheme = {
  name: string;
  bg: string;
  cardBg: string;
  primary: string;
  primaryText: string;
  accent: string;
  accentLight: string;
  border: string;
  textMain: string;
  textMuted: string;
  tagBg: string;
  tagText: string;
};

export type StudySheetCard = {
  id: string;
  type: 'concept' | 'definition' | 'table' | 'formula' | 'code' | 'process' | 'warning';
  title: string;
  badge?: string;
  content?: string;
  points?: string[];
  items?: any[];
  tableData?: { headers: string[]; rows: string[][] };
  sourcePages: number[];
  blockIds: string[];
};

export type StudySheet = {
  id: string;
  sheetNumber: number;
  totalSheets: number;
  topicId: string;
  topicTitle: string;
  title: string;
  subtitle: string;
  theme: StudySheetTheme;
  cards: StudySheetCard[];
  diagramType: 'layers' | 'flowchart' | 'comparison' | 'mindmap';
  sourcePages: number[];
  blockIds: string[];
  coverageScore: number;
  svgImage?: string;
};

export type PageCoverageStat = {
  page: number;
  totalBlocks: number;
  mappedBlocks: number;
  coverage: number;
};

export type CoverageReport = {
  totalBlocks: number;
  mappedBlocks: number;
  coveragePercentage: number;
  flaggedUncertainBlocks: number;
  sourcePageCoverage: PageCoverageStat[];
  notes: string[];
};

export type TopicExplanation = {
  topicId: string;
  topicTitle: string;
  overview: string;
  sourcePages: number[];
  linkedSheetNumbers: number[];
  sections: {
    detailedExplanation: string;
    simplifiedAnalogy?: string;
    definitions: { term: string; meaning: string; sourcePages?: number[] }[];
    stepByStepProcesses?: { step: number; action: string; explanation: string }[];
    practicalExamples?: string[];
    conceptComparisons?: { conceptA: string; conceptB: string; difference: string }[];
    diagramOrTableExplanation?: string;
    keyTakeaways: string[];
    sourceGroundedPoints: string[];
    supplementaryAiPoints: string[];
  };
};

export type ExplanationsData = {
  language: 'ar_eg' | 'ar_msa' | 'en';
  topics: TopicExplanation[];
};

export type Workspace = {
  id: string;
  title: string;
  createdAt: string;
  lastStudiedAt: string;
  documents: DocumentItem[];
  messages: Message[];
  guide: Guide | null;
  quizzes: Quiz[];
  attempts: Attempt[];
  weakTopics: string[];
  aiMode: "live" | "demo";
  concepts?: Concept[];
  overallMastery?: number;
  masteryCounts?: { weak: number; learning: number; good: number; strong: number };
  masteryEvidence?: MasteryEvidence[];
  nextBestAction?: NextBestAction | null;
  vivaAttempts?: VivaAttempt[];
  studySheets?: StudySheet[];
  coverageReport?: CoverageReport | null;
  semanticTopics?: SemanticTopic[];
  explanations?: ExplanationsData | null;
  extractedBlocks?: ContentBlock[];
  processingStage?: { stage: string; progress: number; label: string };
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  picture: string;
  isGuest: boolean;
};

export type Account = {
  id: string;
  displayName: string;
  googleName: string;
  email: string;
  picture: string;
  fieldOfStudy: string;
  studyLevel: string;
  dailyGoal: number;
  joinedAt: string;
};

