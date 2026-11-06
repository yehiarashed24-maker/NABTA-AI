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
  count: topLevelCount,
  questionTypes: topLevelQuestionTypes,
  difficulty: topLevelDifficulty,
  geminiJsonFn = null,
}) {
  const count = Math.max(2, Math.min(25, Number(settings.questionCount || topLevelCount || 5)));
  const difficulty = settings.difficulty || topLevelDifficulty || 'medium';
  const candidateTypes =
    Array.isArray(settings.questionTypes) && settings.questionTypes.length
      ? settings.questionTypes
      : Array.isArray(topLevelQuestionTypes) && topLevelQuestionTypes.length
      ? topLevelQuestionTypes
      : ['mcq'];
  const requestedTypes = candidateTypes.map((t) => (t === 'essay' ? 'short' : t));

  // 1. Filter blocks based on the selected scope
  const targetBlocks = filterBlocksByScope(blocks, topics, sheets, scope, workspace);

  // Derive target title
  const title = deriveQuizTitle(scope, topics, workspace);

  let questions = [];

  if (typeof geminiJsonFn === 'function') {
    try {
      const aiQuestions = await callGeminiForQuiz(targetBlocks, count, difficulty, requestedTypes, geminiJsonFn);
      // Filter strictly to requested question types
      questions = aiQuestions.filter((q) => {
        const normType = q.type === 'essay' ? 'short' : q.type;
        return requestedTypes.includes(normType);
      });
    } catch (err) {
      console.warn('[Quiz AI Warning]: Falling back to deterministic quiz generation:', err.message);
    }
  }

  if (questions.length < count) {
    const fallbackQuestions = buildDeterministicQuiz(
      targetBlocks,
      count - questions.length,
      difficulty,
      requestedTypes,
      topics
    );
    questions.push(...fallbackQuestions);
  }

  // Ensure every question has ID, strictly allowed type, options, explanation, sourcePage, rubric
  const validatedQuestions = questions.slice(0, count).map((q, idx) => {
    const normType = q.type === 'essay' ? 'short' : q.type;
    const finalType = requestedTypes.includes(normType) ? normType : requestedTypes[idx % requestedTypes.length];
    return {
      id: q.id || `q_${randomUUID().slice(0, 8)}`,
      type: finalType,
      topic: q.topic || 'General Lecture Review',
      question: q.question || `Question ${idx + 1}`,
      options:
        finalType === 'true_false'
          ? ['True', 'False']
          : Array.isArray(q.options)
          ? q.options
          : undefined,
      correctAnswer: q.correctAnswer || (finalType === 'true_false' ? 'True' : 'A'),
      explanation: q.explanation || 'Verified from lecture notes.',
      sourcePage: Number(q.sourcePage) || targetBlocks[0]?.page || 1,
      rubric:
        Array.isArray(q.rubric) && q.rubric.length
          ? q.rubric
          : [
              { criterion: 'Identifies core principle', weight: 40 },
              { criterion: 'Explains technical mechanism', weight: 40 },
              { criterion: 'Accurate terminology', weight: 20 },
            ],
    };
  });

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
    .slice(0, 25)
    .map((b) => `[Page ${b.page} | ${b.type}]: ${b.content}`)
    .join('\n\n');

  const typeDescriptions = {
    mcq: `- "mcq": 4 distinct options (["A) ...", "B) ...", "C) ...", "D) ..."]). Single unambiguous correctAnswer ("A", "B", "C", or "D").`,
    true_false: `- "true_false": Clear factual statement from the lecture, options: ["True", "False"], correctAnswer: "True" or "False".`,
    short: `- "short": Conceptual short-answer/essay question with a detailed reference correctAnswer and a grading rubric of 2-3 criteria (weights totalling 100).`,
    scenario: `- "scenario": Practical real-world problem scenario testing application of the lecture concepts (format as an "mcq" or "short" with full explanation).`,
  };

  const allowedDescriptions = requestedTypes
    .map((t) => typeDescriptions[t] || typeDescriptions.mcq)
    .join('\n');

  const prompt = `You are a university exam professor creating an adaptive quiz for students.
Create exactly ${count} high-quality, rigorously grounded exam questions based strictly on the provided lecture notes.

Settings:
- Difficulty: ${difficulty}
- STRICT ALLOWED QUESTION TYPES: ${JSON.stringify(requestedTypes)}

Allowed Question Type Specifications:
${allowedDescriptions}

CRITICAL MANDATORY RULES:
1. Every single generated question MUST have its "type" field set ONLY to one of: ${JSON.stringify(requestedTypes)}.
2. DO NOT generate any question type that is not in ${JSON.stringify(requestedTypes)}! For example, if only ["mcq"] is allowed, 100% of questions MUST be "mcq" with 4 options (A, B, C, D).
3. Ground all questions strictly in the provided Source Material and cite the exact sourcePage number.
4. Return ONLY valid JSON adhering to:
{
  "questions": [
    {
      "id": "q1",
      "type": "${requestedTypes[0] || 'mcq'}",
      "topic": "Topic Name",
      "question": "Clear question text?",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
      "correctAnswer": "A",
      "explanation": "Why this is correct based on the lecture.",
      "sourcePage": 1,
      "rubric": [{ "criterion": "Identifies core principle", "weight": 50 }, { "criterion": "Applies concept", "weight": 50 }]
    }
  ]
}

Source Material:
${contextText.slice(0, 6000)}`;

  const res = await geminiJsonFn(prompt);
  if (res && Array.isArray(res.questions) && res.questions.length) {
    return res.questions;
  }
  return [];
}

function buildDeterministicQuiz(blocks, count, difficulty, requestedTypes, topics) {
  const questions = [];
  const allowed = Array.isArray(requestedTypes) && requestedTypes.length ? requestedTypes : ['mcq'];
  const defBlocks = blocks.filter((b) => b.type === 'definition');
  const bulletBlocks = blocks.filter((b) => b.type === 'bullet');
  const paraBlocks = blocks.filter((b) => b.type === 'paragraph');
  const allContentBlocks = [...defBlocks, ...bulletBlocks, ...paraBlocks, ...blocks];

  let qIdx = 0;

  while (questions.length < count) {
    const targetType = allowed[qIdx % allowed.length];
    const b = allContentBlocks[qIdx % (allContentBlocks.length || 1)] || {
      page: 1,
      title: 'Core Lecture Concept',
      content: 'Foundational principle from the uploaded lecture.',
    };
    qIdx++;

    if (targetType === 'mcq') {
      const def = defBlocks[(qIdx - 1) % (defBlocks.length || 1)];
      if (def && qIdx <= defBlocks.length + 1) {
        const otherDefs = defBlocks.filter((d) => d.term !== def.term);
        const distractor1 = otherDefs[0]?.content?.slice(0, 85) || 'Unrelated mechanism outside the scope of this module.';
        const distractor2 = otherDefs[1]?.content?.slice(0, 85) || 'Reverse operation that bypasses standard verification.';
        const distractor3 = otherDefs[2]?.content?.slice(0, 85) || 'Optional configuration disabled by default.';
        questions.push({
          id: `q_${qIdx}`,
          type: 'mcq',
          topic: def.term || 'Core Terminology',
          question: `According to page ${def.page} of the lecture notes, which statement accurately defines "${def.term}"?`,
          options: [
            `A) ${def.content.slice(0, 110)}`,
            `B) ${distractor1}`,
            `C) ${distractor2}`,
            `D) ${distractor3}`,
          ],
          correctAnswer: 'A',
          explanation: `On page ${def.page}, "${def.term}" is defined as: ${def.content}`,
          sourcePage: def.page,
        });
      } else {
        const snippet = (b.points?.[0] || b.content || 'Core lecture principle').slice(0, 110);
        questions.push({
          id: `q_${qIdx}`,
          type: 'mcq',
          topic: b.title || 'Lecture Review',
          question: `Which of the following points is explicitly stated in the lecture material on page ${b.page || 1}?`,
          options: [
            `A) ${snippet}`,
            'B) The lecture states that this requirement is obsolete and should be ignored',
            'C) All verification and licensing constraints are automatically waived',
            'D) None of the principles apply to real-world implementations',
          ],
          correctAnswer: 'A',
          explanation: `Grounded directly in page ${b.page || 1}: "${snippet}".`,
          sourcePage: b.page || 1,
        });
      }
    } else if (targetType === 'true_false') {
      const isTrue = qIdx % 2 === 1;
      const rawSentence = (b.points?.[0] || b.content || 'This principle is essential').split('.')[0];
      const questionText = isTrue
        ? `True or False: According to page ${b.page || 1}, ${rawSentence}.`
        : `True or False: According to page ${b.page || 1}, ${rawSentence} is completely false and never applicable.`;
      questions.push({
        id: `q_${qIdx}`,
        type: 'true_false',
        topic: b.title || 'Conceptual Principles',
        question: questionText,
        options: ['True', 'False'],
        correctAnswer: isTrue ? 'True' : 'False',
        explanation: `Page ${b.page || 1} states: "${rawSentence}".`,
        sourcePage: b.page || 1,
      });
    } else {
      // 'short' / 'essay' / 'scenario'
      const sb = paraBlocks[(qIdx - 1) % (paraBlocks.length || 1)] || defBlocks[(qIdx - 1) % (defBlocks.length || 1)] || b;
      questions.push({
        id: `q_${qIdx}`,
        type: targetType === 'scenario' ? 'scenario' : 'short',
        topic: sb.title || 'Conceptual Walkthrough',
        question: `Explain the key principle and practical importance of "${sb.title || 'the concept'}" covered on page ${sb.page || 1}.`,
        correctAnswer: sb.content,
        explanation: `Key points from page ${sb.page || 1}: ${sb.content}`,
        sourcePage: sb.page || 1,
        rubric: [
          { criterion: 'Explains foundational objective accurately', weight: 40 },
          { criterion: 'Mentions key details from the lecture slide', weight: 40 },
          { criterion: 'Uses accurate terminology', weight: 20 },
        ],
      });
    }
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
