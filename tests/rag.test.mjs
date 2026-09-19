import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { chunkPages, localEmbedding, sanitizeText, detectPageNumber, retrieve, isConversationalGreeting } = await import('../server/index.mjs');

test('sanitizes control characters and excess whitespace', () => {
  assert.equal(sanitizeText('  hello\0    world\n\n\nagain  '), 'hello world\n\nagain');
});

test('chunks material while preserving page metadata', () => {
  const chunks = chunkPages([{ page: 7, text: 'A sentence about carbon fixation. '.repeat(30) }], 180, 30);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((chunk) => chunk.page === 7 && chunk.text.length > 0));
});

test('local embeddings are deterministic and normalized', () => {
  const first = localEmbedding('chlorophyll absorbs light');
  const second = localEmbedding('chlorophyll absorbs light');
  assert.deepEqual(first, second);
  const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 0.000001);
});

test('detectPageNumber identifies Arabic and English page numbers correctly', () => {
  assert.equal(detectPageNumber('اشرح الصفحه الخامسه كامله'), 5);
  assert.equal(detectPageNumber('اشرح الصفحة الخامسة'), 5);
  assert.equal(detectPageNumber('صفحة 5'), 5);
  assert.equal(detectPageNumber('صفحه 12'), 12);
  assert.equal(detectPageNumber('explain page 5 in detail'), 5);
  assert.equal(detectPageNumber('slide 7 summary'), 7);
  assert.equal(detectPageNumber('الشريحة الثامنة'), 8);
  assert.equal(detectPageNumber('صفحة 200'), 200);
  assert.equal(detectPageNumber('صفحة 1000'), 1000);
  assert.equal(detectPageNumber('صفحة ٢٠٠'), 200);
  assert.equal(detectPageNumber('صفحة ١٠٠٠'), 1000);
  assert.equal(detectPageNumber('اشرح صفحة ال ٢٠ كاملة'), 20);
  assert.equal(detectPageNumber('اشرح صفحة الـ 200 كاملة'), 200);
  assert.equal(detectPageNumber('صفحة مائتين'), 200);
  assert.equal(detectPageNumber('صفحة الف'), 1000);
  assert.equal(detectPageNumber('صفحة مائة وخمسين'), 150);
  assert.equal(detectPageNumber('صفحة خمسمائة'), 500);
  assert.equal(detectPageNumber('ما هو تعريف الأمن السيبراني؟'), null);
});

test('isConversationalGreeting detects Arabic, English and other language pleasantries', () => {
  assert.equal(isConversationalGreeting('اهلا'), true);
  assert.equal(isConversationalGreeting('اهلا بك'), true);
  assert.equal(isConversationalGreeting('أهلاً بك'), true);
  assert.equal(isConversationalGreeting('السلام عليكم'), true);
  assert.equal(isConversationalGreeting('hello'), true);
  assert.equal(isConversationalGreeting('hi'), true);
  assert.equal(isConversationalGreeting('hi nabta'), true);
  assert.equal(isConversationalGreeting('hey'), true);
  assert.equal(isConversationalGreeting('bonjour'), true);
  assert.equal(isConversationalGreeting('hola'), true);
  assert.equal(isConversationalGreeting('hallo'), true);
  assert.equal(isConversationalGreeting('اشرح صفحة 5'), false);
  assert.equal(isConversationalGreeting('ما هو نطاق أمن الكمبيوتر؟'), false);
});

test('cleanPdfText strips repeated headers and footers', async () => {
  const { cleanPdfText } = await import('../server/index.mjs');
  const sample = 'Chapter 1: Computer Security\nConfidentiality means privacy.\nPage 1 of 30';
  const cleaned = cleanPdfText(sample);
  assert.ok(!cleaned.includes('Page 1 of 30'));
  assert.ok(cleaned.includes('Confidentiality means privacy'));
});

test('page-aware retrieval retrieves ONLY the requested page', async () => {
  const chunks = [
    { id: 'c1', documentId: 'd1', page: 1, text: 'Intro to cybersecurity and threats.', embedding: localEmbedding('cybersecurity') },
    { id: 'c2', documentId: 'd1', page: 5, text: 'Page 5 details on symmetric encryption and DES algorithm.', embedding: localEmbedding('encryption') },
    { id: 'c3', documentId: 'd1', page: 8, text: 'Page 8 details on public key cryptography.', embedding: localEmbedding('cryptography') },
  ];
  const results = await retrieve(chunks, 'اشرح الصفحة الخامسة كاملة', { minScore: 0.1, limit: 3 });
  assert.equal(results.length, 1);
  assert.equal(results[0].page, 5);
  assert.ok(results[0].text.includes('symmetric encryption'));
});

test('monotonic quiz numbering persists and ignores deletions', () => {
  const workspace = {
    id: 'test-ws',
    lastQuizNumber: 0,
    quizzes: [],
  };

  // Generate Quiz 1
  workspace.lastQuizNumber = (workspace.lastQuizNumber || 0) + 1;
  workspace.quizzes.push({ id: 'q1', quizNumber: workspace.lastQuizNumber, title: `Quiz #${workspace.lastQuizNumber}` });
  assert.equal(workspace.quizzes[0].quizNumber, 1);

  // Generate Quiz 2
  workspace.lastQuizNumber += 1;
  workspace.quizzes.push({ id: 'q2', quizNumber: workspace.lastQuizNumber, title: `Quiz #${workspace.lastQuizNumber}` });
  assert.equal(workspace.quizzes[1].quizNumber, 2);

  // Generate Quiz 3
  workspace.lastQuizNumber += 1;
  workspace.quizzes.push({ id: 'q3', quizNumber: workspace.lastQuizNumber, title: `Quiz #${workspace.lastQuizNumber}` });
  assert.equal(workspace.quizzes[2].quizNumber, 3);

  // Delete Quiz 2
  workspace.quizzes = workspace.quizzes.filter(q => q.id !== 'q2');
  assert.equal(workspace.quizzes.length, 2);
  assert.equal(workspace.quizzes[0].quizNumber, 1);
  assert.equal(workspace.quizzes[1].quizNumber, 3);

  // Generate next quiz -> MUST BE Quiz #4!
  workspace.lastQuizNumber += 1;
  workspace.quizzes.push({ id: 'q4', quizNumber: workspace.lastQuizNumber, title: `Quiz #${workspace.lastQuizNumber}` });
  assert.equal(workspace.quizzes[2].quizNumber, 4);
});

test('i18n translation keys are complete and voiceTutorBtn is localized in Arabic', async () => {
  const fs = await import('fs');
  const code = fs.readFileSync('./src/i18n.tsx', 'utf-8');
  assert.ok(code.includes('voiceTutorBtn: "المعلم الصوتي"'), 'voiceTutorBtn must be defined in Arabic');
  assert.ok(code.includes('voiceTutorBtn: "Voice Tutor"'), 'voiceTutorBtn must be defined in English');
  assert.ok(code.includes('tabTutor: "المعلم الذكي"'), 'tabTutor must match المعلم الذكي');
});

test('MCQ BiDi parsing isolates option letters and parses correct answer cards cleanly', () => {
  const lines = [
    'A) A way to recover lost data',
    'B) A measure of how much a system is threatened',
    '(C) A software update',
    'D. A software update'
  ];

  for (const line of lines) {
    const optionMatch = line.match(/^(?:[\*\-•]\s*)?(?:\*\*)?(?:\(?\s*([A-D])\s*[\)\.\:\-]|\(([A-D])\))\s*(?:\*\*)?\s*(.+)$/i);
    assert.ok(optionMatch, `Must match option line: ${line}`);
    const letter = (optionMatch[1] || optionMatch[2]).toUpperCase();
    assert.ok(['A', 'B', 'C', 'D'].includes(letter));
    assert.ok(optionMatch[3].trim().length > 0);
  }

  const answerLine = 'الإجابة الصحيحة: B) A measure of how much a system is threatened by an attack';
  const correctLineMatch = answerLine.match(/^(?:[\*\-•]\s*)?(?:\*\*)?(?:الإجابة الصحيحة|Correct Answer|الخيار الصحيح)(?:\*\*)?\s*[:：]\s*(?:\*\*)?\s*(.+)$/i);
  assert.ok(correctLineMatch);
  const rawAnswer = correctLineMatch[1].replace(/\*\*/g, '').trim();
  const optMatch = rawAnswer.match(/^(?:الخيار\s*)?(?:\(?\s*([A-D])\s*[\)\.\:]?|\(([A-D])\))(?:\s+(.+))?$/i);
  assert.ok(optMatch);
  assert.equal(optMatch[1] || optMatch[2], 'B');
  assert.equal(optMatch[3].trim(), 'A measure of how much a system is threatened by an attack');
});

