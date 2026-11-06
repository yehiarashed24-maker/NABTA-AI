import { randomUUID } from 'node:crypto';

/**
 * Builds custom quizzes with flexible scopes (lecture, single topic, multi-topic,
 * specific pages, specific study sheets, weak concepts) and diverse question types
 * (MCQ, True/False, Short-Answer/Essay with rubric, Fill-in-the-blank, Scenario).
 */
export async function generateFlexibleQuiz({
  workspace,
  topics = [],
  blocks = [],
  sheets = [],
  scope = { type: 'lecture' },
  settings = {},
  geminiJsonFn = null,
}) {
  const count = Math.max(2, Math.min(25, Number(settings.questionCount || 5)));
  const difficulty = settings.difficulty || 'medium';
  const requestedTypes = Array.isArray(settings.questionTypes) && settings.questionTypes.length
    ? settings.questionTypes
    : ['mcq', 'true_false', 'short'];

  // 1. Filter blocks based on the selected scope
  const targetBlocks = filterBlocksByScope(blocks, topics, sheets, scope, workspace);

  // Derive target title
  const title = deriveQuizTitle(scope, topics, workspace);

  let questions = [];

  if (typeof geminiJsonFn === 'function') {
    try {
      questions = await callGeminiForQuiz(targetBlocks, count, difficulty, requestedTypes, geminiJsonFn);
    } catch (err) {
      console.warn('[Quiz AI Warning]: Falling back to deterministic quiz generation:', err.message);
    }
  }

  if (!questions.length) {
    questions = buildDeterministicQuiz(targetBlocks, count, difficulty, requestedTypes, topics);
  }

  // Ensure every question has ID, type, options, explanation, sourcePage, rubric
  const validatedQuestions = questions.slice(0, count).map((q, idx) => ({
    id: q.id || `q_${randomUUID().slice(0, 8)}`,
    type: q.type || 'mcq',
    topic: q.topic || 'General Lecture Review',
    question: q.question || `Question ${idx + 1}`,
    options: Array.isArray(q.options) ? q.options : undefined,
    correctAnswer: q.correctAnswer || (q.type === 'true_false' ? 'True' : 'A'),
    explanation: q.explanation || 'Verified from lecture notes.',
    sourcePage: Number(q.sourcePage) || targetBlocks[0]?.page || 1,
    rubric: Array.isArray(q.rubric) && q.rubric.length ? q.rubric : [
      { criterion: 'Identifies core principle', weight: 40 },
      { criterion: 'Explains technical mechanism', weight: 40 },
      { criterion: 'Accurate terminology', weight: 20 },
    ],
  }));

  // Assign monotonic quiz number
  const nextQuizNum = (workspace?.lastQuizNumber || 0) + 1;

  return {
    id: randomUUID(),
    workspaceId: workspace?.id || 'default_ws',
    quizNumber: nextQuizNum,
    title: `${title} · Quiz #${nextQuizNum}`,
    scope,
    difficulty,
    questionCount: validatedQuestions.length,
    topic: title,
    createdAt: new Date().toISOString(),
    settings: {
      showInstantFeedback: settings.showInstantFeedback ?? true,
      difficulty,
      questionTypes: requestedTypes,
    },
    questions: validatedQuestions,
  };
}

function filterBlocksByScope(blocks, topics, sheets, scope, workspace) {
  if (scope.type === 'topic' && scope.topicId) {
    const topic = topics.find((t) => t.id === scope.topicId);
    if (topic) return blocks.filter((b) => topic.blockIds.includes(b.id));
  }

  if (scope.type === 'multi_topic' && Array.isArray(scope.topicIds) && scope.topicIds.length) {
    const selectedTopics = topics.filter((t) => scope.topicIds.includes(t.id));
    const allowedBlockIds = new Set(selectedTopics.flatMap((t) => t.blockIds));
    const matched = blocks.filter((b) => allowedBlockIds.has(b.id));
    if (matched.length) return matched;
  }

  if (scope.type === 'pages' && Array.isArray(scope.pages) && scope.pages.length) {
    const pageSet = new Set(scope.pages.map(Number));
    const matched = blocks.filter((b) => pageSet.has(b.page));
    if (matched.length) return matched;
  }

  if (scope.type === 'sheets' && Array.isArray(scope.sheetNumbers) && scope.sheetNumbers.length) {
    const selectedSheets = sheets.filter((s) => scope.sheetNumbers.includes(s.sheetNumber));
    const allowedBlockIds = new Set(selectedSheets.flatMap((s) => s.blockIds));
    const matched = blocks.filter((b) => allowedBlockIds.has(b.id));
    if (matched.length) return matched;
  }

  if (scope.type === 'weak_topics') {
    const weakList = workspace.weakTopics || [];
    const weakTopics = topics.filter((t) => weakList.some((w) => t.title.toLowerCase().includes(w.toLowerCase())));
    if (weakTopics.length) {
      const allowedBlockIds = new Set(weakTopics.flatMap((t) => t.blockIds));
      const matched = blocks.filter((b) => allowedBlockIds.has(b.id));
      if (matched.length) return matched;
    }
  }

  return blocks;
}

function deriveQuizTitle(scope, topics, workspace) {
  if (scope.type === 'topic' && scope.topicId) {
    const topic = topics.find((t) => t.id === scope.topicId);
    if (topic) return topic.title;
  }
  if (scope.type === 'multi_topic' && Array.isArray(scope.topicIds)) {
    return `Multi-Topic Review (${scope.topicIds.length} topics)`;
  }
  if (scope.type === 'pages' && Array.isArray(scope.pages)) {
    return `Pages ${scope.pages.join(', ')} Review`;
  }
  if (scope.type === 'sheets' && Array.isArray(scope.sheetNumbers)) {
    return `Study Sheets ${scope.sheetNumbers.join(', ')} Quiz`;
  }
  if (scope.type === 'weak_topics') {
    return 'Targeted Remedial Quiz (Weak Concepts)';
  }
  return workspace?.title || 'Comprehensive Lecture Quiz';
}

async function callGeminiForQuiz(blocks, count, difficulty, requestedTypes, geminiJsonFn) {
  const contextText = blocks
    .slice(0, 15)
    .map((b) => `[Page ${b.page} | ${b.type}]: ${b.content}`)
    .join('\n\n');

  const prompt = `You are a university exam professor creating an adaptive quiz for students.
Create exactly ${count} high-quality, rigorously grounded exam questions based strictly on the provided lecture notes.

Settings:
- Difficulty: ${difficulty}
- Allowed Question Types: ${requestedTypes.join(', ')}

Types to include:
1. "mcq": 4 distinct options (A, B, C, D). Single unambiguous correct answer. Clear pedagogical explanation.
2. "true_false": Statement, correctAnswer ("True" or "False"), explanation.
3. "short": Conceptual essay/short question, rubric with 2-3 grading criteria and weights (totalling 100).
4. "fill_blank": Sentence with "___" blank, correctAnswer word/phrase.
5. "scenario": Practical problem scenario testing application of the concept.

CRITICAL RULES:
- Ground all questions in the text.
- Cite the sourcePage number accurately.
- Return ONLY valid JSON adhering to:
{
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "topic": "Topic Name",
      "question": "Clear question text?",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
      "correctAnswer": "A",
      "explanation": "Why this is correct based on the lecture.",
      "sourcePage": 1,
      "rubric": [{ "criterion": "Identifies core principle", "weight": 50 }, { "criterion": "Applies formula", "weight": 50 }]
    }
  ]
}

Source Material:
${contextText.slice(0, 4500)}`;

  const res = await geminiJsonFn(prompt);
  if (res && Array.isArray(res.questions) && res.questions.length) {
    return res.questions;
  }
  return [];
}

function buildDeterministicQuiz(blocks, count, difficulty, requestedTypes, topics) {
  const questions = [];
  const defBlocks = blocks.filter((b) => b.type === 'definition');
  const eqBlocks = blocks.filter((b) => b.type === 'equation');
  const bulletBlocks = blocks.filter((b) => b.type === 'bullet');
  const paraBlocks = blocks.filter((b) => b.type === 'paragraph');

  let qIdx = 0;

  // 1. Definitions -> MCQs
  for (const def of defBlocks) {
    if (questions.length >= count) break;
    qIdx++;

    const otherDefs = defBlocks.filter((d) => d.term !== def.term);
    const distractor1 = otherDefs[0]?.content?.slice(0, 70) || 'An outdated legacy protocol used in early networking.';
    const distractor2 = otherDefs[1]?.content?.slice(0, 70) || 'A measure of memory consumption during process switching.';
    const distractor3 = 'An optional optimization parameter disabled by default.';

    questions.push({
      id: `q_${qIdx}`,
      type: 'mcq',
      topic: def.term || 'Core Terminology',
      question: `According to the lecture notes, what is the definition of "${def.term}"?`,
      options: [
        `A) ${def.content.slice(0, 95)}`,
        `B) ${distractor1}`,
        `C) ${distractor2}`,
        `D) ${distractor3}`,
      ],
      correctAnswer: 'A',
      explanation: `On page ${def.page}, "${def.term}" is explicitly defined as: ${def.content}`,
      sourcePage: def.page,
    });
  }

  // 2. True / False Questions
  for (const para of paraBlocks) {
    if (questions.length >= count) break;
    qIdx++;

    const isTrue = qIdx % 2 === 0;
    const sentence = para.content.split('.')[0] || para.content;
    const questionText = isTrue
      ? `True or False: According to page ${para.page}, ${sentence}.`
      : `True or False: The lecture states that ${sentence} is completely unnecessary and never recommended.`;

    questions.push({
      id: `q_${qIdx}`,
      type: 'true_false',
      topic: 'Conceptual Principles',
      question: questionText,
      options: ['True', 'False'],
      correctAnswer: isTrue ? 'True' : 'False',
      explanation: `Lecture page ${para.page} explicitly clarifies: "${sentence}".`,
      sourcePage: para.page,
    });
  }

  // 3. Short Answer / Essay with Rubric
  for (const bb of bulletBlocks) {
    if (questions.length >= count) break;
    qIdx++;

    questions.push({
      id: `q_${qIdx}`,
      type: 'short',
      topic: bb.title || 'Technical Process Walkthrough',
      question: `In your own words, explain the core mechanism discussed on page ${bb.page}. Mention at least two key components.`,
      correctAnswer: bb.content,
      explanation: `Key points from page ${bb.page} include: ${bb.content}`,
      sourcePage: bb.page,
      rubric: [
        { criterion: 'Explains foundational objective', weight: 40 },
        { criterion: 'Cites at least two distinct steps/components', weight: 40 },
        { criterion: 'Uses correct academic terminology', weight: 20 },
      ],
    });
  }

  // Fallback if needed
  while (questions.length < count) {
    qIdx++;
    const b = blocks[qIdx % (blocks.length || 1)];
    questions.push({
      id: `q_${qIdx}`,
      type: 'mcq',
      topic: 'Lecture Review',
      question: `Which of the following concepts is directly addressed on page ${b?.page || 1}?`,
      options: [
        `A) ${(b?.content || 'Core lecture foundation').slice(0, 80)}`,
        'B) High-frequency asynchronous clock drift mitigation',
        'C) Quantum entanglement key distribution',
        'D) Zero-knowledge spatial partitioning algorithms',
      ],
      correctAnswer: 'A',
      explanation: `Verified from source page ${b?.page || 1}.`,
      sourcePage: b?.page || 1,
    });
  }

  return questions;
}

/**
 * Evaluates a student's answer with rubric grading for open-ended answers.
 */
export async function evaluateStudentAnswer(question, userAnswer, geminiJsonFn = null) {
  const normUser = String(userAnswer || '').trim();
  const qType = question.type || 'mcq';

  // 1. MCQ & True/False Evaluation
  if (qType === 'mcq' || qType === 'true_false') {
    const correctAns = String(question.correctAnswer || '').trim();
    let isCorrect = false;

    if (qType === 'true_false') {
      isCorrect = normUser.toLowerCase() === correctAns.toLowerCase();
    } else {
      // Check letter match (A, B, C, D)
      const userLetterMatch = normUser.match(/^([A-D])\b/i);
      const correctLetterMatch = correctAns.match(/^([A-D])\b/i);
      if (userLetterMatch && correctLetterMatch) {
        isCorrect = userLetterMatch[1].toUpperCase() === correctLetterMatch[1].toUpperCase();
      } else {
        isCorrect = normUser.toLowerCase().includes(correctAns.toLowerCase()) || correctAns.toLowerCase().includes(normUser.toLowerCase());
      }
    }

    return {
      correct: isCorrect,
      score: isCorrect ? 100 : 0,
      feedback: isCorrect
        ? 'Excellent! Your answer is completely correct and aligns with the lecture.'
        : `Incorrect. The correct answer is: ${question.correctAnswer}. ${question.explanation || ''}`,
    };
  }

  // 2. Short Answer / Essay Rubric Evaluation
  if (typeof geminiJsonFn === 'function' && normUser.length > 5) {
    try {
      const prompt = `You are a fair academic grading assistant evaluating a student's answer.
Question: "${question.question}"
Reference Correct Answer: "${question.correctAnswer}"
Grading Rubric: ${JSON.stringify(question.rubric || [])}
Student's Answer: "${normUser}"

Evaluate the answer impartially based on conceptual understanding (do not penalize phrasing variations if the concepts are right).
Return strictly valid JSON:
{
  "score": 85,
  "correctPoints": ["Student accurately identified X"],
  "missingPoints": ["Student omitted detail Y"],
  "incorrectClaims": [],
  "feedback": "Constructive 1-2 sentence feedback.",
  "improvedAnswer": "An exemplary high-scoring answer."
}`;

      const aiGrade = await geminiJsonFn(prompt);
      if (aiGrade && typeof aiGrade.score === 'number') {
        return {
          correct: aiGrade.score >= 60,
          score: aiGrade.score,
          feedback: aiGrade.feedback || 'Answer evaluated according to rubric.',
          essayGrade: {
            score: aiGrade.score,
            correctPoints: Array.isArray(aiGrade.correctPoints) ? aiGrade.correctPoints : ['Demonstrated core understanding'],
            missingPoints: Array.isArray(aiGrade.missingPoints) ? aiGrade.missingPoints : [],
            incorrectClaims: Array.isArray(aiGrade.incorrectClaims) ? aiGrade.incorrectClaims : [],
            feedback: aiGrade.feedback || '',
            improvedAnswer: aiGrade.improvedAnswer || question.correctAnswer,
          },
        };
      }
    } catch (err) {
      console.warn('[Essay Grade AI Warning]:', err.message);
    }
  }

  // Deterministic Fallback Rubric Evaluation
  const refWords = String(question.correctAnswer || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const userWords = normUser.toLowerCase().split(/\s+/);
  let matchedCount = 0;
  for (const w of refWords) {
    if (userWords.some((uw) => uw.includes(w) || w.includes(uw))) matchedCount++;
  }

  const matchRatio = refWords.length ? Math.min(1, matchedCount / Math.max(1, refWords.length * 0.45)) : 0.8;
  const score = Math.round(matchRatio * 100);

  return {
    correct: score >= 60,
    score,
    feedback: score >= 60
      ? 'Good answer! You demonstrated solid understanding of the core principles.'
      : 'Incomplete answer. Review the key terms and process details referenced in the lecture.',
    essayGrade: {
      score,
      correctPoints: score >= 60 ? ['Addressed primary question criteria'] : ['Attempted response'],
      missingPoints: score < 80 ? ['Include specific technical terms from the lecture'] : [],
      incorrectClaims: [],
      feedback: `Evaluated against reference explanation from page ${question.sourcePage || 1}.`,
      improvedAnswer: question.correctAnswer || 'See lecture notes for full breakdown.',
    },
  };
}
