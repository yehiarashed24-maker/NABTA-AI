import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

process.env.NODE_ENV = 'test';

import { extractStructuredBlocks, extractDocumentContent } from '../server/pdfProcessor.mjs';
import { groupContentSemantically, groupContentIntoSemanticTopics } from '../server/topicGrouper.mjs';
import { generateStudySheetsForTopics, buildStudySheets, renderSheetToSvg, validateContentCoverage, compileStudySheetsPdf, sanitizeSvg } from '../server/studySheetRenderer.mjs';
import { generateStructuredExplanations } from '../server/explanationSystem.mjs';
import { generateFlexibleQuiz, evaluateStudentAnswer } from '../server/quizSystem.mjs';
const { canAccessWorkspace, isValidUploadBuffer } = await import('../server/index.mjs');

const sampleLecturePages = [
  {
    page: 1,
    text: `
Computer Networks & Security Architecture
Lecture 1: OSI Model & Fundamental Security Principles

1. Introduction to the OSI Model
The Open Systems Interconnection model is a conceptual framework that standardizes telecommunication functions into seven distinct abstraction layers.

Definition: OSI Model is a reference model established by ISO to facilitate vendor-neutral network communications.

Key Layers:
- Physical Layer: Transmits raw bitstreams over physical transmission medium.
- Data Link Layer: Manages node-to-node data transfer and frame packaging (e.g. Ethernet MAC).
- Network Layer: Handles packet forwarding, host addressing, and routing paths across subnets.
- Transport Layer: End-to-end message delivery, segmentation, and reliability via TCP and UDP.
- Session, Presentation, Application: Manage sessions, syntax encoding, and application interfaces (HTTP, DNS).
    `,
  },
  {
    page: 2,
    text: `
2. Security Fundamentals: The CIA Triad
Network security relies on three core tenets:
- Confidentiality: Ensuring that information is not disclosed to unauthorized entities.
- Integrity: Safeguarding the accuracy and completeness of assets and preventing tampering.
- Availability: Ensuring timely and reliable access to information assets for authorized users.

Comparison of Transport Protocols:
Protocol | Connection Type | Reliability | Primary Use Cases
TCP | Connection-oriented | High (ACK/Retransmission) | Web browsing, Email, File transfer
UDP | Connectionless | Best-effort (No ACK) | Live streaming, DNS, VoIP

Formula: Throughput = (TCP Window Size / Round Trip Time)
    `,
  },
  {
    page: 3,
    text: `
3. Cryptographic Primitives & Key Management
Encryption transforms plaintext into ciphertext to preserve confidentiality.

Definition: Asymmetric Encryption utilizes a public key for encryption and a distinct private key for decryption.

Example: RSA Algorithm key generation workflow:
1. Select two distinct prime numbers p and q.
2. Calculate modulus n = p * q.
3. Compute Euler totient phi(n) = (p - 1) * (q - 1).
4. Choose public exponent e coprime to phi(n).
5. Derive private exponent d such that (d * e) mod phi(n) = 1.

Warning: Weak or reused keys expose entire communication channels to eavesdropping.
    `,
  },
];

test('PDF Processor: extracts structured blocks with types, pages and hierarchy', () => {
  const blocks = extractStructuredBlocks(sampleLecturePages);

  assert.ok(blocks.length > 5, 'Should extract multiple structured content blocks');

  // Verify presence of headings, definitions, bullet lists, tables, and formulas
  const headings = blocks.filter((b) => b.type === 'heading');
  const definitions = blocks.filter((b) => b.type === 'definition');
  const bullets = blocks.filter((b) => b.type === 'bullet');
  const tables = blocks.filter((b) => b.type === 'table');
  const formulas = blocks.filter((b) => b.type === 'formula');

  assert.ok(headings.length >= 2, 'Should detect headings');
  assert.ok(definitions.length >= 2, 'Should extract definitions');
  assert.ok(bullets.length >= 1, 'Should extract bullet points');
  assert.ok(tables.length >= 1, 'Should extract table data');
  assert.ok(formulas.length >= 1, 'Should extract mathematical formulas');

  // Verify source page tracking on every block
  assert.ok(blocks.every((b) => typeof b.page === 'number' && b.page >= 1 && b.page <= 3));
});

test('Topic Grouper: groups content semantically into coherent pedagogical units', async () => {
  const blocks = extractStructuredBlocks(sampleLecturePages);
  const topics = await groupContentSemantically(blocks, sampleLecturePages, 'Computer Networks & Security');

  assert.ok(topics.length >= 2, 'Should create at least 2 distinct semantic topics');
  assert.ok(topics.every((t) => t.title && t.sourcePages.length > 0 && t.blockIds.length > 0));

  // Verify dynamic sheet allocation exists
  const totalAllocatedSheets = topics.reduce((sum, t) => sum + (t.allocatedSheets || 1), 0);
  assert.ok(totalAllocatedSheets >= topics.length, 'Total allocated sheets should accommodate content density');
});

test('Study Sheet Renderer: builds deterministic SVG sheets without text hallucination', () => {
  const blocks = extractStructuredBlocks(sampleLecturePages);
  const topics = [
    {
      id: 'topic-1',
      title: 'OSI Model Architecture',
      description: 'Layered communication stack',
      sourcePages: [1],
      subtopics: ['Physical', 'Data Link', 'Network', 'Transport'],
      keyTerms: ['OSI Model', 'TCP', 'UDP'],
      prerequisites: [],
      order: 1,
      blockIds: blocks.filter((b) => b.page === 1).map((b) => b.id),
      allocatedSheets: 1,
    },
    {
      id: 'topic-2',
      title: 'CIA Triad & Protocol Comparisons',
      description: 'Security fundamentals and transport tradeoffs',
      sourcePages: [2],
      subtopics: ['Confidentiality', 'Integrity', 'Availability'],
      keyTerms: ['CIA Triad', 'Throughput'],
      prerequisites: ['topic-1'],
      order: 2,
      blockIds: blocks.filter((b) => b.page === 2).map((b) => b.id),
      allocatedSheets: 1,
    },
  ];

  const sheets = buildStudySheets(topics, blocks, 'Computer Networks');
  assert.equal(sheets.length, 2, 'Should generate 2 study sheets');

  // Verify SVG output
  const svg1 = renderSheetToSvg(sheets[0]);
  assert.ok(svg1.startsWith('<svg'), 'Should output valid SVG tag');
  assert.ok(svg1.includes('OSI Model Architecture'), 'SVG should contain the exact topic title');
  assert.ok(svg1.includes('Physical Layer'), 'SVG should contain extracted technical text');
  assert.ok(svg1.includes('</svg>'), 'SVG should terminate properly');

  const svg2 = renderSheetToSvg(sheets[1]);
  assert.ok(svg2.includes('TCP') || svg2.includes('Throughput'), 'SVG should contain extracted technical text');
});

test('Coverage Validator: audits mapped blocks and flags coverage accuracy', () => {
  const blocks = extractStructuredBlocks(sampleLecturePages);
  const topics = [
    {
      id: 'topic-all',
      title: 'Full Material',
      description: 'Entire lecture',
      sourcePages: [1, 2, 3],
      subtopics: [],
      keyTerms: [],
      prerequisites: [],
      order: 1,
      blockIds: blocks.map((b) => b.id),
      allocatedSheets: 2,
    },
  ];

  const sheets = buildStudySheets(topics, blocks, 'Full Material');
  const coverageReport = validateContentCoverage(blocks, sheets);

  assert.ok(coverageReport.totalBlocks > 0, 'Total blocks must be positive');
  assert.ok(coverageReport.mappedBlocks > 0, 'Mapped blocks must be positive');
  assert.ok(coverageReport.coveragePercentage >= 95, 'Coverage percentage should be at or near 100%');
  assert.equal(coverageReport.sourcePageCoverage.length, 3, 'Should report coverage for all 3 source pages');
});

test('PDF Compiler: compiles study sheets into downloadable multi-page PDF', async () => {
  const blocks = extractStructuredBlocks(sampleLecturePages);
  const topics = [
    {
      id: 'topic-1',
      title: 'Network Fundamentals',
      description: 'Introductory concepts',
      sourcePages: [1],
      subtopics: [],
      keyTerms: [],
      prerequisites: [],
      order: 1,
      blockIds: blocks.filter((b) => b.page === 1).map((b) => b.id),
      allocatedSheets: 1,
    },
  ];
  const sheets = buildStudySheets(topics, blocks, 'Network Fundamentals');
  const pdfBytes = await compileStudySheetsPdf(sheets, 'Network Fundamentals');

  assert.ok(Buffer.isBuffer(pdfBytes), 'Should output a Node.js Buffer');
  assert.ok(pdfBytes.length > 500, 'PDF buffer should be non-trivial');
  assert.equal(pdfBytes.subarray(0, 4).toString('ascii'), '%PDF', 'Buffer should begin with %PDF magic header');
});

test('Structured Explanations: generates grounded explanations with dialect support', async () => {
  const blocks = extractStructuredBlocks(sampleLecturePages);
  const topics = [
    {
      id: 'topic-sec',
      title: 'CIA Triad & Protocols',
      description: 'Core security and protocols',
      sourcePages: [2],
      subtopics: ['Confidentiality', 'Integrity', 'Availability'],
      keyTerms: ['CIA Triad', 'Throughput'],
      prerequisites: [],
      order: 1,
      blockIds: blocks.filter((b) => b.page === 2).map((b) => b.id),
      allocatedSheets: 1,
    },
  ];

  // Test Egyptian Arabic dialect
  const explanationsArEg = await generateStructuredExplanations(topics, blocks, [], 'ar_eg');
  assert.equal(explanationsArEg.language, 'ar_eg');
  assert.equal(explanationsArEg.topics.length, 1);
  const egTopic = explanationsArEg.topics[0];
  assert.ok(egTopic.sections.detailedExplanation.length > 50);
  assert.ok(egTopic.sections.sourceGroundedPoints.length > 0, 'Should have source grounded points');
  assert.ok(egTopic.sections.supplementaryAiPoints.length > 0, 'Should distinguish AI supplementary points');

  // Test English dialect
  const explanationsEn = await generateStructuredExplanations(topics, blocks, [], 'en');
  assert.equal(explanationsEn.language, 'en');
  assert.ok(explanationsEn.topics[0].sections.detailedExplanation.includes('CIA Triad') || explanationsEn.topics[0].sections.detailedExplanation.includes('Security'));
});

test('Flexible Quiz Generation: supports scopes, question types and monotonic numbering', async () => {
  const blocks = extractStructuredBlocks(sampleLecturePages);
  const topics = [
    {
      id: 't-1',
      title: 'OSI Model',
      description: 'Network layers',
      sourcePages: [1],
      subtopics: [],
      keyTerms: ['OSI Model'],
      prerequisites: [],
      order: 1,
      blockIds: blocks.filter((b) => b.page === 1).map((b) => b.id),
    },
    {
      id: 't-2',
      title: 'Security Principles',
      description: 'CIA triad and crypto',
      sourcePages: [2, 3],
      subtopics: [],
      keyTerms: ['CIA Triad', 'Encryption'],
      prerequisites: [],
      order: 2,
      blockIds: blocks.filter((b) => b.page >= 2).map((b) => b.id),
    },
  ];

  const quiz = await generateFlexibleQuiz({
    workspace: { id: 'ws-1', title: 'Computer Networks', lastQuizNumber: 2 },
    topics,
    blocks,
    sheets: [],
    scope: { type: 'topic', topicId: 't-1' },
    settings: {
      questionTypes: ['mcq', 'true_false', 'short', 'scenario'],
      difficulty: 'medium',
      questionCount: 4,
      showInstantFeedback: true,
    },
  });

  // Monotonic numbering
  assert.equal(quiz.quizNumber, 3, 'Quiz number should monotonically increment to 3');
  assert.ok(quiz.questions.length >= 3, 'Should generate requested question count');
  assert.ok(quiz.questions.every((q) => q.question && q.explanation && q.sourcePage > 0));

  // Verify rubrics on short-answer questions
  const shortQ = quiz.questions.find((q) => q.type === 'short');
  if (shortQ) {
    assert.ok(Array.isArray(shortQ.rubric) && shortQ.rubric.length > 0, 'Short answer question must include grading rubric');
    
    // Evaluate student response using rubric
    const evalResult = await evaluateStudentAnswer(shortQ, 'The OSI model standardizes vendor-neutral network communication across seven layers.');
    assert.ok(evalResult.score >= 50, 'Accurate student answer should receive passing score');
    assert.ok(evalResult.feedback.length > 0, 'Evaluation should provide constructive feedback');
  }
});

test('Topic Grouper & Scalability: clusters a 500-slide curriculum into coherent thematic modules covering 100% of pages without gaps', async () => {
  // Generate 500 simulated lecture slides with chapter transitions, definitions, and key points
  const simulated500Slides = [];
  const simulatedBlocks = [];
  let blockIdx = 0;

  for (let pageNum = 1; pageNum <= 500; pageNum++) {
    const chapterNum = Math.ceil(pageNum / 20); // 25 thematic chapters
    const isChapterStart = (pageNum - 1) % 20 === 0;

    let slideText = `Module ${chapterNum}: Core System Dynamics (Slide ${pageNum})\n`;
    if (isChapterStart) {
      slideText += `Chapter ${chapterNum}: Advanced Computational Architecture\n`;
      blockIdx++;
      simulatedBlocks.push({
        id: `b_${blockIdx}`,
        page: pageNum,
        type: 'heading',
        title: `Chapter ${chapterNum}: Advanced Computational Architecture`,
        content: `Chapter ${chapterNum}: Advanced Computational Architecture`,
      });
    }

    slideText += `Definition: Concept_${pageNum} is the formal mechanism for state preservation.\n`;
    blockIdx++;
    simulatedBlocks.push({
      id: `b_${blockIdx}`,
      page: pageNum,
      type: 'definition',
      title: `Concept_${pageNum}`,
      term: `Concept_${pageNum}`,
      content: `The formal mechanism for state preservation at slide ${pageNum}.`,
    });

    slideText += `• Key principle observed at stage ${pageNum}.\n`;
    blockIdx++;
    simulatedBlocks.push({
      id: `b_${blockIdx}`,
      page: pageNum,
      type: 'bullet',
      title: `Points (Page ${pageNum})`,
      content: `Key principle observed at stage ${pageNum}.`,
      points: [`Key principle observed at stage ${pageNum}.`],
    });

    simulated500Slides.push({ page: pageNum, text: slideText });
  }

  assert.equal(simulated500Slides.length, 500, 'Must have exactly 500 slides');

  // Run semantic grouping on the 500-slide curriculum
  const { topics, totalSheetsRequired } = await import('../server/topicGrouper.mjs').then((m) =>
    m.groupContentIntoSemanticTopics(simulatedBlocks, simulated500Slides, null)
  );

  // Assertions for 500-slide scale
  assert.ok(topics.length >= 20 && topics.length <= 40, `500 slides should be clustered into 20-40 thematic topics (got ${topics.length})`);
  assert.ok(totalSheetsRequired >= topics.length, 'Total sheets should match or exceed topic count');

  // Verify that EVERY slide from 1 to 500 is assigned to at least one topic (NO GAPS!)
  const coveredPages = new Set();
  for (const t of topics) {
    for (const p of t.sourcePages) coveredPages.add(p);
  }

  for (let p = 1; p <= 500; p++) {
    assert.ok(coveredPages.has(p), `Slide ${p} must be covered in the grouped topics`);
  }

  // Verify 100% of blocks are mapped to topics
  const allMappedBlockIds = new Set();
  for (const t of topics) {
    for (const bId of t.blockIds) allMappedBlockIds.add(bId);
  }
  assert.equal(allMappedBlockIds.size, simulatedBlocks.length, '100% of all 500-slide blocks must be assigned to topics');
});

test('Study Sheet Renderer: preserves 100% of definitions, points, tables, and equations with dynamic canvas height and zero truncation', () => {
  // Topic with 8 definitions, 10 detailed points, 2 tables, 2 equations (would have been truncated under old 4-item limits)
  const denseBlocks = [];
  let bId = 0;

  const sampleDefs = [
    { term: 'Deterministic Model', meaning: 'A mathematical model where output is determined solely by initial conditions.' },
    { term: 'Stochastic Process', meaning: 'A collection of random variables representing value evolution over time.' },
    { term: 'Bayesian Inference', meaning: 'A statistical method updating probability of hypothesis as more evidence arrives.' },
    { term: 'Markov Property', meaning: 'Future states depend only upon current state, not preceding sequence.' },
    { term: 'Entropy Rate', meaning: 'The asymptotic average entropy per unit of time of a stochastic process.' },
    { term: 'Gibbs Sampling', meaning: 'MCMC algorithm for generating sequence of samples from joint probability distribution.' },
    { term: 'Viterbi Algorithm', meaning: 'Dynamic programming algorithm for finding most likely sequence of hidden states.' },
    { term: 'Hidden Markov Model', meaning: 'Statistical model where modeled system is assumed to be Markov process with unobserved states.' },
  ];

  for (const d of sampleDefs) {
    bId++;
    denseBlocks.push({
      id: `dense_def_${bId}`,
      page: 1,
      type: 'definition',
      title: d.term,
      term: d.term,
      content: d.meaning,
    });
  }

  for (let pIdx = 1; pIdx <= 10; pIdx++) {
    bId++;
    denseBlocks.push({
      id: `dense_pt_${bId}`,
      page: 2,
      type: 'bullet',
      title: `Critical analysis item ${pIdx}`,
      content: `In-depth analysis point ${pIdx} detailing convergence guarantees and error bounds.`,
      points: [`In-depth analysis point ${pIdx} detailing convergence guarantees and error bounds.`],
    });
  }

  bId++;
  denseBlocks.push({
    id: `dense_table_${bId}`,
    page: 2,
    type: 'table',
    title: 'Model Comparison Matrix',
    content: 'Model | Type | Complexity\nHMM | Generative | O(N^2 T)\nCRF | Discriminative | O(N^2 T)',
    tableData: {
      headers: ['Model', 'Type', 'Complexity'],
      rows: [
        ['HMM', 'Generative', 'O(N^2 T)'],
        ['CRF', 'Discriminative', 'O(N^2 T)'],
        ['MEMM', 'Discriminative', 'O(N^2 T)'],
      ],
    },
  });

  bId++;
  denseBlocks.push({
    id: `dense_eq_${bId}`,
    page: 3,
    type: 'formula',
    title: 'Posterior Probability',
    content: 'P(A|B) = (P(B|A) * P(A)) / P(B)',
  });

  const topic = {
    id: 'topic_dense_1',
    title: 'Probabilistic Graphical Models',
    description: 'Foundations of Bayesian networks and Markov models.',
    sourcePages: [1, 2, 3],
    allocatedSheets: 1,
    blockIds: denseBlocks.map((b) => b.id),
  };

  const { sheets, coverageReport } = generateStudySheetsForTopics([topic], denseBlocks, 'Advanced Machine Learning');
  assert.equal(sheets.length, 1, 'Should generate 1 consolidated dense sheet');
  const sheet = sheets[0];

  // 1. Coverage percentage must be 100%
  assert.equal(coverageReport.coveragePercentage, 100, 'Coverage report must show 100% content preservation');

  // 2. SVG Image must exist and start with <svg
  assert.ok(sheet.svgImage && sheet.svgImage.startsWith('<svg'), 'SVG must be valid vector XML');

  // 3. ZERO TRUNCATION: Every single one of the 8 definitions must appear in the SVG
  for (const d of sampleDefs) {
    assert.ok(
      sheet.svgImage.includes(d.term),
      `SVG must contain definition term "${d.term}" without being sliced or omitted`
    );
  }

  // 4. All 10 detailed points must be preserved
  for (let pIdx = 1; pIdx <= 10; pIdx++) {
    assert.ok(
      sheet.svgImage.includes(`Critical analysis item ${pIdx}`) || sheet.svgImage.includes(`analysis point ${pIdx}`),
      `SVG must contain analysis point ${pIdx}`
    );
  }

  // 5. Table rows must be preserved in full
  assert.ok(sheet.svgImage.includes('CRF') && sheet.svgImage.includes('MEMM'), 'SVG must contain all table rows');

  // 6. Formula must be preserved
  assert.ok(sheet.svgImage.includes('P(A|B)'), 'SVG must contain the mathematical formula');

  // 7. Dynamic height must have auto-expanded beyond the default 980px to accommodate all content
  const heightMatch = sheet.svgImage.match(/height="(\d+)"/);
  assert.ok(heightMatch, 'SVG must declare dynamic height attribute');
  const computedHeight = parseInt(heightMatch[1], 10);
  assert.ok(computedHeight > 980, `Dynamic SVG height (${computedHeight}px) must expand beyond 980px to prevent clipping`);
});

test('Real Lecture PDF Integration: Computer Security Lecture 2 (27 slides, 100+ blocks, multi-sheet zero-loss)', async () => {
  const pdfPath = '/Users/yousef/Downloads/computer security lecture 2.pdf';
  let buf;
  try {
    buf = await fs.readFile(pdfPath);
  } catch {
    return; // Skip if local file is not on CI machine
  }

  assert.equal(isValidUploadBuffer(buf, 'application/pdf'), true, 'Real PDF must pass magic-byte validation');

  const extracted = await extractDocumentContent(buf, 'computer security lecture 2.pdf', 'application/pdf');
  assert.equal(extracted.pageCount, 27, 'Should extract all 27 pages of Computer Security Lecture 2');
  assert.ok(extracted.blocks.length >= 100, `Should extract 100+ structured blocks with line-aware Y-coordinate parsing (got ${extracted.blocks.length})`);
  assert.ok(extracted.stats.definitionsCount >= 15, 'Should extract 15+ security definitions (FIPS 200, Design Principles, etc.)');

  const { topics, totalSheetsRequired } = await groupContentIntoSemanticTopics(extracted.blocks, extracted.pages, null);
  assert.ok(topics.length >= 5, `Should organize 27-page lecture into 5+ thematic study units (got ${topics.length})`);
  assert.ok(totalSheetsRequired >= 10, `Should allocate 10+ detailed study sheets without cramming (got ${totalSheetsRequired})`);

  const { sheets, coverageReport } = generateStudySheetsForTopics(topics, extracted.blocks, 'Computer Security Lecture 2');
  assert.equal(coverageReport.coveragePercentage, 100, 'Must achieve 100% zero-loss block coverage');
  assert.equal(coverageReport.mappedBlocks, extracted.blocks.length, 'Every single extracted block must be mapped to a study sheet');
  assert.ok(sheets.length >= 6, 'Must generate 6+ dense, well-packed SVG study sheets');

  const compiledPdf = await compileStudySheetsPdf(sheets, 'Computer Security Lecture 2 → Full Book ★');
  assert.ok(compiledPdf.length > 5000, 'Compiled multi-sheet PDF must be non-empty and handle Unicode symbols (→, ★)');
});

test('Security Hardening: SVG sanitizer, strict multi-tenant workspace isolation, and magic-byte upload validation', () => {
  // 1. SVG Sanitizer blocks XSS vectors while preserving valid SVG
  const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>fetch('https://evil.com')</script><foreignObject><iframe></iframe></foreignObject><a href="javascript:alert(2)"><text>Safe Text</text></a></svg>`;
  const cleaned = sanitizeSvg(maliciousSvg);
  assert.ok(!cleaned.includes('<script'), 'Must strip <script> tags');
  assert.ok(!cleaned.includes('<foreignObject'), 'Must strip <foreignObject> tags');
  assert.ok(!cleaned.includes('onload='), 'Must strip inline event handlers');
  assert.ok(!cleaned.includes('javascript:'), 'Must neutralize javascript: URIs');
  assert.ok(cleaned.includes('<text>Safe Text</text>'), 'Must preserve legitimate SVG content');

  // 2. Multi-tenant workspace isolation (IDOR / BOLA prevention)
  const userAWorkspace = { id: 'ws-a', ownerId: 'google-user-111' };
  const userBWorkspace = { id: 'ws-b', ownerId: 'google-user-222' };
  const guestWorkspace = { id: 'ws-guest', ownerId: 'guest-local' };

  assert.equal(canAccessWorkspace(userAWorkspace, 'google-user-111'), true, 'Owner can access own workspace');
  assert.equal(canAccessWorkspace(userAWorkspace, 'google-user-222'), false, 'User B cannot access User A workspace');
  assert.equal(canAccessWorkspace(userAWorkspace, 'guest-local'), false, 'Guest cannot access Google user workspace');
  assert.equal(canAccessWorkspace(guestWorkspace, 'google-user-111'), false, 'Google user is isolated from guest workspaces');
  assert.equal(canAccessWorkspace(guestWorkspace, 'guest-local'), true, 'Guest can access guest workspace');

  // 3. Magic-byte upload validation
  assert.equal(isValidUploadBuffer(Buffer.from('%PDF-1.7\n...'), 'application/pdf'), true, 'Valid PDF header accepted');
  assert.equal(isValidUploadBuffer(Buffer.from('<html><script>alert(1)</script></html>'), 'application/pdf'), false, 'HTML disguised as PDF rejected');
  assert.equal(isValidUploadBuffer(Buffer.from('Clean study notes on CIA triad'), 'text/plain'), true, 'Clean plain text accepted');
  assert.equal(isValidUploadBuffer(Buffer.from('Binary\x00file'), 'text/plain'), false, 'Binary with null bytes disguised as text rejected');
  assert.equal(isValidUploadBuffer(Buffer.from('<script>evil()</script>'), 'text/plain'), false, 'Script payload in text file rejected');
});


