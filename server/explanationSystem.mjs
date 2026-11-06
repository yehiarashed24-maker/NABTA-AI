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

  // Batch AI explanation generation in chunks of up to 6 topics per call to avoid quota exhaustion & speed up response
  const aiExplanationsByTopicId = new Map();
  if (typeof geminiJsonFn === 'function' && topics.length > 0) {
    const batchSize = 6;
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

    if (!explanationData && typeof geminiJsonFn === 'function' && topics.length === 1) {
      try {
        explanationData = await callGeminiForTopicExplanation(topic, topicBlocks, targetLang, geminiJsonFn);
      } catch (err) {
        console.warn(`[Explanation AI Warning on ${topic.title}]:`, err.message);
      }
    }

    if (!explanationData || !explanationData.overview) {
      explanationData = buildDeterministicTopicExplanation(topic, topicBlocks, targetLang);
    }

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
    styleInstruction = `Write ALL explanations, overviews, analogies, definitions meanings, steps, examples, and takeaways in friendly, natural Egyptian Arabic (اللهجة المصرية العامية المبسطة الذكية زي دكتور جامعة بيشرح لطلابه)، while keeping technical English terms in parentheses.`;
  } else if (language === 'ar_msa') {
    styleInstruction = `Write ALL explanations, overviews, analogies, definitions meanings, steps, examples, and takeaways in formal academic Modern Standard Arabic (اللغة العربية الفصحى الأكاديمية الرصينة) with English technical terms in parentheses.`;
  } else {
    styleInstruction = `Write ALL explanations, overviews, analogies, definitions, steps, examples, and takeaways in clear, engaging academic English.`;
  }

  const topicsPayload = batchTopics.map((t) => {
    const tBlocks = allBlocks.filter((b) => t.blockIds.includes(b.id));
    return {
      topicId: t.id,
      title: t.title,
      sourcePages: t.sourcePages,
      sourceMaterial: tBlocks
        .map((b) => `[p.${b.page} ${b.type}] ${b.content}`)
        .join('\n')
        .slice(0, 2200),
    };
  });

  const prompt = `You are a master university educator and AI tutor in Nabta AI.
Generate comprehensive, structured explanations for each of the following ${batchTopics.length} lecture topics.

Language & Style Requirement (MANDATORY):
${styleInstruction}

Output strictly valid JSON matching this exact schema:
{
  "topics": [
    {
      "topicId": "exact topicId from input",
      "overview": "2-3 sentence engaging overview in the requested language",
      "detailedExplanation": "Thorough multi-paragraph explanation of all concepts in the topic in the requested language",
      "simplifiedAnalogy": "Intuitive real-life analogy in the requested language",
      "definitions": [
        { "term": "Term", "meaning": "Clear definition in the requested language", "sourcePages": [1] }
      ],
      "stepByStepProcesses": [
        { "step": 1, "action": "Step title", "explanation": "Step details in the requested language" }
      ],
      "practicalExamples": ["Concrete real-world example in the requested language"],
      "conceptComparisons": [
        { "conceptA": "Concept A", "conceptB": "Concept B", "difference": "Core distinction in the requested language" }
      ],
      "diagramOrTableExplanation": "Explanation of key relationships or tables in the requested language",
      "keyTakeaways": ["Key exam takeaway 1", "Key exam takeaway 2"],
      "sourceGroundedPoints": ["Direct point from the lecture slides in the requested language"],
      "supplementaryAiPoints": ["Helpful extra context/insight from the AI tutor in the requested language"]
    }
  ]
}

Topics & Source Material:
${JSON.stringify(topicsPayload, null, 2)}`;

  return await geminiJsonFn(prompt);
}

async function callGeminiForTopicExplanation(topic, blocks, language, geminiJsonFn) {
  let styleInstruction = '';
  if (language === 'ar_eg') {
    styleInstruction = `Use friendly, warm Egyptian Arabic for explanations (اللهجة المصرية العامية المبسطة الذكية)، مثل أسلوب أستاذ جامعي أو مهندس يشرح لطلابه بطريقة سلسة ومشوقة، مع الاحتفاظ بجميع المصطلحات العلمية الإنجليزية وترجمتها.`;
  } else if (language === 'ar_msa') {
    styleInstruction = `Use formal academic Modern Standard Arabic (اللغة العربية الفصحى الأكاديمية الرصينة) with precise technical terminology and rigorous explanations.`;
  } else {
    styleInstruction = `Use clear, academic and engaging English, explaining technical concepts thoroughly with intuitive analogies.`;
  }

  const contextText = blocks.map((b) => `[Page ${b.page} | ${b.type}]: ${b.content}`).join('\n\n');

  const prompt = `You are a master educator and AI tutor in Nabta AI.
Create an exhaustive, structured explanation for the topic: "${topic.title}".

Style Guidelines:
${styleInstruction}

CRITICAL RULES:
1. Ground the explanation in the provided source material.
2. Distinctly separate points explicitly stated in the PDF ("sourceGroundedPoints") from pedagogical analogies/background added by AI ("supplementaryAiPoints").
3. Include step-by-step processes, real-world examples, and comparisons.
4. Output strictly valid JSON matching:
{
  "overview": "Engaging high-level pedagogical overview of the topic.",
  "detailedExplanation": "Thorough, step-by-step conceptual walkthrough.",
  "simplifiedAnalogy": "Intuitive real-life analogy explaining the core idea.",
  "definitions": [
    { "term": "Term", "meaning": "Precise definition", "sourcePages": [1] }
  ],
  "stepByStepProcesses": [
    { "step": 1, "action": "Action Name", "explanation": "Detailed mechanism" }
  ],
  "practicalExamples": ["Concrete scenario or application"],
  "conceptComparisons": [
    { "conceptA": "A", "conceptB": "B", "difference": "Key difference" }
  ],
  "diagramOrTableExplanation": "Walkthrough of related tables, formulas, or diagrams.",
  "keyTakeaways": ["Core takeaway to remember for exams"],
  "sourceGroundedPoints": ["Explicit fact 1 directly from the lecture notes"],
  "supplementaryAiPoints": ["Helpful context/analogy provided by AI tutor"]
}

Source Material:
${contextText.slice(0, 4500)}`;

  return await geminiJsonFn(prompt);
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
