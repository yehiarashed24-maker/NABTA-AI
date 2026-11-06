import { randomUUID } from 'node:crypto';

/**
 * Generates structured, topic-by-topic pedagogical explanations
 * supporting English, Egyptian Arabic, and Modern Standard Arabic,
 * strictly distinguishing original PDF material from AI pedagogical supplements.
 */
export async function generateStructuredExplanations(
  topics = [],
  blocks = [],
  sheetsOrLang = [],
  language = 'ar_eg',
  geminiJsonFn = null
) {
  let sheets = sheetsOrLang;
  let targetLang = language;
  if (typeof sheetsOrLang === 'string') {
    targetLang = sheetsOrLang;
    sheets = [];
  }
  const safeSheets = Array.isArray(sheets) ? sheets : [];

  if (!topics.length) {
    return { language: targetLang, topics: [] };
  }

  const topicExplanations = [];

  // Batch AI explanation generation in chunks of 2 topics per call so each topic gets a massive token budget for exhaustive explanations
  const aiExplanationsByTopicId = new Map();
  if (typeof geminiJsonFn === 'function' && topics.length > 0) {
    const batchSize = 2;
    for (let i = 0; i < topics.length; i += batchSize) {
      const batchTopics = topics.slice(i, i + batchSize);
      try {
        const batchResult = await callGeminiForBatchedTopics(batchTopics, blocks, targetLang, geminiJsonFn);
        if (batchResult && Array.isArray(batchResult.topics)) {
          for (const item of batchResult.topics) {
            if (item && item.topicId) {
              aiExplanationsByTopicId.set(item.topicId, item);
            }
          }
        }
      } catch (err) {
        console.warn(`[Explanation Batch AI Warning]:`, err.message);
      }
    }
  }

  for (const topic of topics) {
    const topicBlocks = blocks.filter((b) => topic.blockIds.includes(b.id));
    const linkedSheets = safeSheets.filter((s) => s.topicId === topic.id);
    const linkedSheetNumbers = linkedSheets.map((s) => s.sheetNumber);

    let explanationData = aiExplanationsByTopicId.get(topic.id) || null;

    if (!explanationData && typeof geminiJsonFn === 'function') {
      try {
        explanationData = await callGeminiForTopicExplanation(topic, topicBlocks, targetLang, geminiJsonFn);
      } catch (err) {
        console.warn(`[Explanation AI Warning on ${topic.title}]:`, err.message);
      }
    }

    if (!explanationData || !explanationData.overview) {
      explanationData = buildDeterministicTopicExplanation(topic, topicBlocks, targetLang);
    }

    // Guarantee 100% complete, un-summarized coverage by merging all verbatim lecture blocks, definitions, and page breakdowns
    explanationData = enrichWithCompleteLectureBlocks(explanationData, topic, topicBlocks, targetLang);

    topicExplanations.push({
      topicId: topic.id,
      topicTitle: topic.title,
      overview: explanationData.overview,
      sourcePages: topic.sourcePages || [1],
      linkedSheetNumbers,
      sections: {
        detailedExplanation: explanationData.detailedExplanation,
        simplifiedAnalogy: explanationData.simplifiedAnalogy,
        definitions: explanationData.definitions || [],
        stepByStepProcesses: explanationData.stepByStepProcesses || [],
        practicalExamples: explanationData.practicalExamples || [],
        conceptComparisons: explanationData.conceptComparisons || [],
        diagramOrTableExplanation: explanationData.diagramOrTableExplanation || '',
        keyTakeaways: explanationData.keyTakeaways || [],
        sourceGroundedPoints: explanationData.sourceGroundedPoints || [],
        supplementaryAiPoints: explanationData.supplementaryAiPoints || [],
      },
    });
  }

  return {
    language: targetLang,
    topics: topicExplanations,
  };
}

async function callGeminiForBatchedTopics(batchTopics, allBlocks, language, geminiJsonFn) {
  let styleInstruction = '';
  if (language === 'ar_eg') {
    styleInstruction = `Write ALL explanations, overviews, analogies, definitions meanings, steps, examples, comparisons, and takeaways in warm, detailed, natural Egyptian Arabic (اللهجة المصرية العامية المبسطة والغنية بالتفاصيل زي دكتور جامعة شاطر بيشرح كل تفصيلة لطلابه ومش بيسيب ولا كلمة من غير توضيح)، while keeping technical English terms in parentheses.`;
  } else if (language === 'ar_msa') {
    styleInstruction = `Write ALL explanations, overviews, analogies, definitions meanings, steps, examples, comparisons, and takeaways in exhaustive, formal academic Modern Standard Arabic (اللغة العربية الفصحى الأكاديمية الرصينة والمفصلة) with English technical terms in parentheses.`;
  } else {
    styleInstruction = `Write ALL explanations, overviews, analogies, definitions, steps, examples, comparisons, and takeaways in exhaustive, clear academic English.`;
  }

  const topicsPayload = batchTopics.map((t) => {
    const tBlocks = allBlocks.filter((b) => t.blockIds.includes(b.id));
    return {
      topicId: t.id,
      title: t.title,
      sourcePages: t.sourcePages,
      sourceMaterial: tBlocks
        .map((b) => `[Page ${b.page} | ${b.type} | ${b.title || ''}]: ${b.points ? b.points.join(' ; ') : b.content}`)
        .join('\n')
        .slice(0, 8000),
    };
  });

  const prompt = `You are a master university professor and AI tutor in Nabta AI.
Generate an EXHAUSTIVE, COMPLETE, UN-SUMMARIZED explanation for each of the following ${batchTopics.length} lecture topics.

CRITICAL ANTI-SUMMARIZATION RULES (MANDATORY):
1. DO NOT SUMMARIZE OR ABBREVIATE! The student wants a 100% COMPLETE explanation of every single slide, page, bullet point, file, concept, and rule in the source material.
2. Language & Style Requirement:
   ${styleInstruction}
3. For "detailedExplanation":
   - Write at least 5 to 8 rich, detailed paragraphs separated by "\\n\\n".
   - Walk through EVERY SINGLE page/slide in "sourcePages" in order (e.g., start paragraphs with "📌 صفحة X ([Slide Title]): ..." in Arabic or "📌 Page X ([Slide Title]): ..." in English).
   - Explain EVERY bullet point, sub-point, mechanism, why it matters, and how it works in practice so the student does not miss a single detail from the lecture.
4. For "definitions":
   - Include ALL terms, concepts, files, licenses, or roles mentioned across these pages (at least 4 to 8 definitions per topic, each with a thorough 2-3 sentence explanation).
5. For "stepByStepProcesses":
   - Include at least 4 to 6 sequential steps explaining the full workflow/process in detail (2-3 sentences per step).
6. For "practicalExamples":
   - Include at least 3 to 4 concrete, detailed real-world scenarios or code/project examples.
7. For "conceptComparisons":
   - Include at least 2 to 4 detailed comparisons contrasting the concepts/models in this topic.
8. For "keyTakeaways", "sourceGroundedPoints", and "supplementaryAiPoints":
   - Include at least 5 to 8 comprehensive points in each array.

Output strictly valid JSON matching this exact schema:
{
  "topics": [
    {
      "topicId": "exact topicId from input",
      "overview": "4-5 sentence comprehensive overview covering the full scope of the topic in the requested language",
      "detailedExplanation": "Exhaustive 5-8 paragraph slide-by-slide and page-by-page explanation covering 100% of the lecture material without any summarization, separated by \\n\\n",
      "simplifiedAnalogy": "Detailed, vivid 4-5 sentence real-life analogy mapping every part of the concept in the requested language",
      "definitions": [
        { "term": "Term", "meaning": "Detailed 2-3 sentence definition and importance in the requested language", "sourcePages": [1] }
      ],
      "stepByStepProcesses": [
        { "step": 1, "action": "Step title", "explanation": "Detailed 2-3 sentence step explanation in the requested language" }
      ],
      "practicalExamples": ["Detailed real-world example 1", "Detailed real-world example 2", "Detailed real-world example 3"],
      "conceptComparisons": [
        { "conceptA": "Concept A", "conceptB": "Concept B", "difference": "Thorough comparison of pros, cons, and differences in the requested language" }
      ],
      "diagramOrTableExplanation": "Detailed multi-sentence walkthrough of all structures, checklists, tables, or architectures in these pages",
      "keyTakeaways": ["Detailed exam takeaway 1", "Detailed exam takeaway 2", "Detailed exam takeaway 3", "Detailed exam takeaway 4", "Detailed exam takeaway 5"],
      "sourceGroundedPoints": ["Complete point 1 from the slides", "Complete point 2 from the slides", "Complete point 3 from the slides", "Complete point 4 from the slides"],
      "supplementaryAiPoints": ["Deep tutor insight 1", "Common exam trap 2", "Practical engineering tip 3", "Conceptual connection 4"]
    }
  ]
}

Topics & Full Source Material:
${JSON.stringify(topicsPayload, null, 2)}`;

  return await geminiJsonFn(prompt);
}

async function callGeminiForTopicExplanation(topic, blocks, language, geminiJsonFn) {
  const res = await callGeminiForBatchedTopics([topic], blocks, language, geminiJsonFn);
  return res?.topics?.[0] || null;
}

/**
 * Post-processes AI or deterministic explanation data to guarantee that 100% of original
 * lecture blocks, definitions, bullet points, and page-by-page details are present without omission.
 */
function enrichWithCompleteLectureBlocks(explanationData, topic, blocks, language) {
  const isArabic = language === 'ar_eg' || language === 'ar_msa';
  const isEgyptian = language === 'ar_eg';

  const data = { ...explanationData };

  // 1. Ensure ALL definitions from the lecture blocks (and colon-delimited terms in bullets) are included
  const existingTerms = new Set(
    (data.definitions || []).map((d) => String(d.term || '').toLowerCase().trim())
  );
  const mergedDefs = [...(data.definitions || [])];

  for (const b of blocks) {
    if (b.type === 'definition' && (b.term || b.title)) {
      const termKey = String(b.term || b.title).toLowerCase().trim();
      if (!existingTerms.has(termKey)) {
        existingTerms.add(termKey);
        mergedDefs.push({
          term: b.term || b.title,
          meaning: b.content,
          sourcePages: [b.page],
        });
      }
    } else if (b.type === 'bullet' && Array.isArray(b.points)) {
      for (const pt of b.points) {
        const colonIdx = String(pt).indexOf(':');
        if (colonIdx > 1 && colonIdx <= 42) {
          const termCand = String(pt).slice(0, colonIdx).trim();
          const meanCand = String(pt).slice(colonIdx + 1).trim();
          const termKey = termCand.toLowerCase();
          if (termCand.length >= 2 && meanCand.length >= 10 && !existingTerms.has(termKey)) {
            existingTerms.add(termKey);
            mergedDefs.push({
              term: termCand,
              meaning: meanCand,
              sourcePages: [b.page],
            });
          }
        }
      }
    }
  }
  data.definitions = mergedDefs;

  // 2. Build a complete Page-by-Page Verbatim Slide Breakdown from blocks and append if not already present
  const pagesMap = new Map();
  for (const b of blocks) {
    const p = b.page || 1;
    if (!pagesMap.has(p)) pagesMap.set(p, []);
    pagesMap.get(p).push(b);
  }

  const pageBreakdowns = [];
  for (const [pageNum, pBlocks] of [...pagesMap.entries()].sort((a, b) => a[0] - b[0])) {
    const headings = pBlocks
      .filter((b) => b.type === 'heading' || b.type === 'subheading')
      .map((b) => b.content)
      .join(' — ');
    const details = [];
    for (const b of pBlocks) {
      if (b.type === 'heading' || b.type === 'subheading') continue;
      if (b.type === 'definition') {
        details.push(`• ${b.term || b.title}: ${b.content}`);
      } else if (b.type === 'bullet' && Array.isArray(b.points) && b.points.length) {
        for (const pt of b.points) {
          details.push(`• ${pt}`);
        }
      } else if (b.content) {
        details.push(`• ${b.content}`);
      }
    }
    if (!details.length && headings) {
      details.push(`• ${headings}`);
    }
    if (details.length) {
      const headerLabel = isEgyptian
        ? `📄 تفصيل محتوى صفحة ${pageNum}${headings ? ` (${headings})` : ''} بالكامل من المحاضرة:`
        : isArabic
        ? `📄 التفصيل الكامل لمحتوى صفحة ${pageNum}${headings ? ` (${headings})` : ''} من المذكرة:`
        : `📄 Complete Slide Breakdown — Page ${pageNum}${headings ? ` (${headings})` : ''}:`;
      pageBreakdowns.push(`${headerLabel}\n${details.join('\n')}`);
    }
  }

  const existingDetailed = String(data.detailedExplanation || '').trim();
  if (pageBreakdowns.length > 0) {
    const sectionDivider = isEgyptian
      ? '━━━ النص والتفصيل الكامل لكل صفحة وسلايد في هذا الموضوع (بدون حذف أي نقطة) ━━━'
      : isArabic
      ? '━━━ الاستعراض الكامل والتفصيلي لكافة صفحات وشرائح هذا الموضوع (دون اختصار) ━━━'
      : '━━━ Complete Page-by-Page Verbatim Slide Breakdown (Zero Omissions) ━━━';

    data.detailedExplanation = existingDetailed
      ? `${existingDetailed}\n\n${sectionDivider}\n\n${pageBreakdowns.join('\n\n')}`
      : pageBreakdowns.join('\n\n');
  }

  // 3. Ensure 100% of verbatim slide points are included in sourceGroundedPoints (no 4-item slicing!)
  const allVerbatimPoints = [];
  for (const b of blocks) {
    const pagePrefix = isArabic ? `(صفحة ${b.page})` : `(Page ${b.page})`;
    if (b.type === 'definition') {
      allVerbatimPoints.push(`${pagePrefix} ${b.term || b.title}: ${b.content}`);
    } else if (b.type === 'bullet' && Array.isArray(b.points) && b.points.length) {
      for (const pt of b.points) {
        allVerbatimPoints.push(`${pagePrefix} ${pt}`);
      }
    } else if (b.type === 'paragraph' && b.content) {
      allVerbatimPoints.push(`${pagePrefix} ${b.content}`);
    } else if (b.type === 'table' && b.tableData?.rows) {
      for (const row of b.tableData.rows) {
        allVerbatimPoints.push(`${pagePrefix} [Table]: ${row.join(' — ')}`);
      }
    }
  }

  const aiGrounded = Array.isArray(data.sourceGroundedPoints) ? data.sourceGroundedPoints : [];
  const combinedGrounded = [...aiGrounded];
  for (const vp of allVerbatimPoints) {
    if (!combinedGrounded.some((existing) => existing.includes(vp.slice(0, 35)))) {
      combinedGrounded.push(vp);
    }
  }
  data.sourceGroundedPoints = combinedGrounded;

  // 4. Ensure stepByStepProcesses has at least 4 rich steps if bullets/processes exist
  if (!Array.isArray(data.stepByStepProcesses) || data.stepByStepProcesses.length < 3) {
    const stepCandidates = allVerbatimPoints.slice(0, 6);
    if (stepCandidates.length > (data.stepByStepProcesses?.length || 0)) {
      data.stepByStepProcesses = stepCandidates.map((pt, idx) => {
        const cleanPt = pt.replace(/^\((?:صفحة|Page)\s*\d+\)\s*/, '');
        const colonPos = cleanPt.indexOf(':');
        const actionTitle =
          colonPos > 2 && colonPos < 45
            ? cleanPt.slice(0, colonPos).trim()
            : isArabic
            ? `الخطوة والركيزة رقم ${idx + 1}`
            : `Step & Core Mechanism ${idx + 1}`;
        return {
          step: idx + 1,
          action: actionTitle,
          explanation: cleanPt,
        };
      });
    }
  }

  return data;
}

function buildDeterministicTopicExplanation(topic, blocks, language) {
  const isArabic = language === 'ar_eg' || language === 'ar_msa';
  const isEgyptian = language === 'ar_eg';

  const defBlocks = blocks.filter((b) => b.type === 'definition');
  const bulletBlocks = blocks.filter((b) => b.type === 'bullet');
  const paraBlocks = blocks.filter((b) => b.type === 'paragraph');
  const tableBlocks = blocks.filter((b) => b.type === 'table');
  const eqBlocks = blocks.filter((b) => b.type === 'equation');

  const rawOverview = paraBlocks[0]?.content || bulletBlocks[0]?.content || topic.description || `${topic.title}`;
  const rawBody =
    paraBlocks.length > 0 || bulletBlocks.length > 0
      ? [...paraBlocks, ...bulletBlocks].map((p) => p.content).join('\n\n')
      : `${topic.title}`;

  const overview = isEgyptian
    ? `في الجزء ده من المحاضرة بنشرح موضوع (${topic.title}) بالتفصيل (صفحات ${(topic.sourcePages || [1]).join('، ')}). الفكرة الأساسية هنا: ${rawOverview}`
    : isArabic
    ? `يتناول هذا المحور موضوع (${topic.title}) استناداً إلى صفحات (${(topic.sourcePages || [1]).join('، ')}) من المحاضرة. الملخص الأساسي: ${rawOverview}`
    : paraBlocks[0]?.content || topic.description || `Comprehensive breakdown of ${topic.title}.`;

  const detailedExplanation = isEgyptian
    ? `شرح تفصيلي مبسط لموضوع (${topic.title}):\nيركز الجزء ده على النقاط والمفاهيم الأساسية اللي جت في المحاضرة:\n\n${rawBody}\n\nخلي بالك إن فهم تفاصيل الجزء ده مهم جداً في التطبيق العملي وأسئلة الامتحانات.`
    : isArabic
    ? `الشرح التفصيلي والأكاديمي لموضوع (${topic.title}):\nيستعرض هذا القسم المبادئ والتفاصيل الواردة في المادة العلمية:\n\n${rawBody}`
    : paraBlocks.length > 0 || bulletBlocks.length > 0
    ? rawBody
    : `${topic.title} represents a foundational pillar in this lecture. Understanding its mechanisms and relationships is essential for solving exam scenarios and practical implementations.`;

  const simplifiedAnalogy = isEgyptian
    ? `عشان تتخيل فكرة (${topic.title}) ببساطة: تخيل إنها زي نظام فرز ذكي في مطار، كل عنصر له مسار محدد ومسؤولية واضحة عشان المنظومة كلها تشتغل بكفاءة وبدون أي تعارض.`
    : isArabic
    ? `لتوضيح مفهوم (${topic.title}): يمكن تشبيه هذا المبدأ بهيكل مؤسسي منظم، حيث يؤدي كل عنصر دوراً محدداً ومتكاملاً لضمان اتساق العمل.`
    : `To intuitively visualize (${topic.title}), consider it analogous to a coordinated transportation hub where every component fulfills a dedicated protocol to guarantee seamless execution.`;

  const definitions = defBlocks.map((d) => ({
    term: d.term || d.title,
    meaning: d.content,
    sourcePages: [d.page],
  }));

  if (!definitions.length && topic.keyTerms.length) {
    topic.keyTerms.forEach((kt) => {
      definitions.push({
        term: kt,
        meaning: `Core concept in ${topic.title} extracted from source notes.`,
        sourcePages: topic.sourcePages || [1],
      });
    });
  }

  const stepByStepProcesses = [
    {
      step: 1,
      action: isArabic ? 'التهيئة وتحديد المعايير' : 'Initialization & Parameter Setup',
      explanation: isArabic
        ? 'يتم فحص المدخلات والتحقق من الشروط الأساسية بناءً على المحتوى المشروح في المحاضرة.'
        : 'Initial parameters and boundary conditions are evaluated according to the lecture guidelines.',
    },
    {
      step: 2,
      action: isArabic ? 'التنفيذ والربط المفاهيمي' : 'Execution & Semantic Association',
      explanation: isArabic
        ? 'تطبيق القواعد والمعادلات لضمان توافق المنظومة واستخراج النتائج المباشرة.'
        : 'Core algorithmic rules or theoretical transformations are systematically applied.',
    },
    {
      step: 3,
      action: isArabic ? 'التحقق والمراجعة النهائية' : 'Verification & Consistency Check',
      explanation: isArabic
        ? 'مقارنة النتائج بالضوابط والمعايير للتأكد من خلوها من الأخطاء المفاهيمية.'
        : 'Final output is verified against theoretical limits and test edge cases.',
    },
  ];

  const practicalExamples = [
    isEgyptian
      ? `تطبيق عملي: تطبيق قواعد (${topic.title}) في الأنظمة الحقيقية بيساعد في تقليل استهلاك الموارد وتفادي الأخطاء البرمجية أو التصميمية الشائعة.`
      : isArabic
      ? `تطبيق عملي: يُستخدم هذا النموذج في البيئات الإنتاجية لتحسين الأداء وتوثيق التدفق المنطقي للعمليات.`
      : `Practical Application: Employing ${topic.title} principles prevents architectural bottlenecks and establishes robust operational boundaries in production systems.`,
  ];

  const conceptComparisons = [
    {
      conceptA: topic.title,
      conceptB: topic.prerequisites[0] || 'Standard Baseline Approach',
      difference: isArabic
        ? 'يركز الأول على التخصص والدقة في المعالجة، بينما يركز الآخر على النظرة العامة الشاملة.'
        : 'The former emphasizes granular structural constraints, whereas the baseline provides generalized scope.',
    },
  ];

  let diagramOrTableExplanation = '';
  if (tableBlocks.length) {
    diagramOrTableExplanation = isArabic
      ? `يوضح الجدول المرفق في صفحة ${tableBlocks[0].page} مقارنة دقيقة بين المتغيرات والعناصر الرئيسية في هذا الموضوع.`
      : `The table on page ${tableBlocks[0].page} systematically contrasts key parameters and metrics.`;
  } else if (eqBlocks.length) {
    diagramOrTableExplanation = isArabic
      ? `المعادلة الرياضية المشروحة: "${eqBlocks[0].content}" توضح العلاقة الحسابية المباشرة بين المتغيرات في المحاضرة.`
      : `The mathematical formula: "${eqBlocks[0].content}" governs the quantitative relationship defined in the lecture.`;
  }

  const keyTakeaways = [
    isArabic
      ? `التركيز على الفروق الجوهرية والتعريفات الدقيقة في صفحات ${(topic.sourcePages || [1]).join(', ')}.`
      : `Master the formal definitions and operational limits documented on pages ${(topic.sourcePages || [1]).join(', ')}.`,
    isArabic
      ? `مراجعة بطاقة أوراق المذاكرة الخاصة بهذا الموضوع لحفظ المخطط المعماري.`
      : `Review the generated study sheet architecture to anchor visual recall.`,
  ];

  const sourceGroundedPoints = blocks.slice(0, 4).map((b) => `(Page ${b.page}): ${b.content.slice(0, 120)}`);
  const supplementaryAiPoints = [
    isEgyptian
      ? `نصيحة المعلم الذكي: الموضوع ده بيتكرر كتير في امتحانات الماجستير والبكالوريوس، ركز دايماً على شروط التطبيق والاستثناءات.`
      : isArabic
      ? `إيضاح إضافي من المعلم الذكي: يُنصح دائماً بمراعاة شروط تطبيق هذه النظرية والتمييز بين حالاتها الخاصة.`
      : `Tutor Pedagogical Insight: Pay close attention to boundary constraints and common failure modes during exams.`,
  ];

  return {
    overview,
    detailedExplanation,
    simplifiedAnalogy,
    definitions,
    stepByStepProcesses,
    practicalExamples,
    conceptComparisons,
    diagramOrTableExplanation,
    keyTakeaways,
    sourceGroundedPoints,
    supplementaryAiPoints,
  };
}
