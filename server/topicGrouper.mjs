import { randomUUID } from 'node:crypto';

/**
 * Analyzes extracted blocks and pages to group them into coherent educational topics
 * in logical teaching order, dynamically calculating the appropriate number of study sheets.
 * Scales seamlessly from small 5-page PDFs to massive 500+ slide decks.
 */
export async function groupContentIntoSemanticTopics(blocks = [], pages = [], geminiJsonFn = null) {
  if (!blocks.length && !pages.length) {
    return { topics: [], totalSheetsRequired: 1 };
  }

  const totalPages = pages.length || 1;
  const targetTopics = totalPages <= 60
    ? Math.max(2, Math.ceil(totalPages / 5))
    : Math.max(2, Math.min(45, Math.ceil(totalPages / 14)));

  let topics = [];

  // Try LLM-assisted semantic grouping if available
  if (typeof geminiJsonFn === 'function') {
    try {
      const outline = prepareDocumentOutlineForAI(blocks, pages, targetTopics);
      const prompt = `You are a curriculum and learning architect.
Analyze the following lecture outline extracted from an academic document spanning ${totalPages} pages/slides.
Organize the entire material into a logical teaching sequence of coherent Semantic Topics.

Requirements:
1. Identify approximately ${targetTopics} distinct cohesive topics in their natural teaching order.
2. Ensure 100% of the document is covered from Page 1 to Page ${totalPages} without leaving any page unassigned.
3. Things grouped into a topic must be strictly semantically related to each other.
4. For each topic, specify:
   - title: concise, descriptive topic name in the document's primary language.
   - description: 1-2 sentence pedagogical scope.
   - sourcePages: array of page numbers where this topic is discussed (e.g. [1, 2, 3, 4, 5]).
   - subtopics: list of key subtopics.
   - keyTerms: list of core terms/definitions in this topic.
   - prerequisites: list of previous topic titles required before this one.
   - estimatedComplexity: 'low' | 'medium' | 'high'
5. Return purely valid JSON adhering to:
{
  "topics": [
    {
      "id": "topic_1",
      "title": "Topic Name",
      "description": "Pedagogical summary of this topic.",
      "sourcePages": [1, 2, 3],
      "subtopics": ["Subtopic 1", "Subtopic 2"],
      "keyTerms": ["Term 1"],
      "prerequisites": [],
      "estimatedComplexity": "medium"
    }
  ]
}

Document Outline:
${outline}`;

      const aiResult = await geminiJsonFn(prompt);
      if (aiResult && Array.isArray(aiResult.topics) && aiResult.topics.length > 0) {
        topics = aiResult.topics.map((t, idx) => ({
          id: t.id || `topic_${idx + 1}`,
          title: t.title || `Topic ${idx + 1}`,
          description: t.description || '',
          sourcePages: Array.isArray(t.sourcePages) && t.sourcePages.length ? t.sourcePages : [idx + 1],
          subtopics: Array.isArray(t.subtopics) ? t.subtopics : [],
          keyTerms: Array.isArray(t.keyTerms) ? t.keyTerms : [],
          prerequisites: Array.isArray(t.prerequisites) ? t.prerequisites : [],
          order: idx + 1,
          estimatedComplexity: t.estimatedComplexity || 'medium',
          blockIds: [],
        }));
      }
    } catch (err) {
      console.warn('[TopicGrouper AI Warning]: Falling back to deterministic grouping:', err.message);
    }
  }

  // Deterministic Fallback if AI was unavailable or returned empty
  if (!topics.length) {
    topics = buildDeterministicTopics(blocks, pages);
  }

  // Assign every content block to its best matching topic (100% preservation)
  assignBlocksToTopics(topics, blocks);

  // Dynamic High-Density Study Sheet Sizing:
  // Pack related items together to minimize redundant sheets while keeping zero truncation.
  let totalSheets = 0;
  for (const topic of topics) {
    const topicBlocks = blocks.filter((b) => topic.blockIds.includes(b.id));
    const wordCount = topicBlocks.reduce((acc, b) => acc + (b.content ? b.content.split(/\s+/).length : 0), 0);
    const tablesCount = topicBlocks.filter((b) => b.type === 'table').length;
    const equationsCount = topicBlocks.filter((b) => b.type === 'equation' || b.type === 'formula').length;
    const definitionsCount = topicBlocks.filter((b) => b.type === 'definition').length;

    // Dynamic Zero-Loss Study Sheet Sizing:
    // Generate as many sheets as needed so related concepts are grouped cleanly without cramming or omitting anything.
    const sheetCount = Math.max(
      1,
      Math.ceil(wordCount / 650),
      Math.ceil(definitionsCount / 8),
      Math.ceil(tablesCount / 2),
      Math.ceil(topicBlocks.length / 12)
    );

    topic.allocatedSheets = sheetCount;
    topic.metrics = { wordCount, tablesCount, equationsCount, definitionsCount };
    totalSheets += sheetCount;
  }

  totalSheets = Math.max(1, totalSheets);

  return {
    topics,
    totalSheetsRequired: totalSheets,
  };
}

export async function groupContentSemantically(blocks = [], pages = [], geminiJsonFn = null) {
  const result = await groupContentIntoSemanticTopics(blocks, pages, geminiJsonFn);
  return result.topics;
}

function prepareDocumentOutlineForAI(blocks, pages, targetTopics = 10) {
  const parts = [];
  const totalPages = pages.length;
  parts.push(`Total Pages/Slides: ${totalPages}, Total Content Blocks: ${blocks.length}, Target Topics: ~${targetTopics}`);

  const headings = blocks.filter((b) => b.type === 'heading' || b.type === 'subheading');
  if (headings.length) {
    parts.push(`Key Headings Across Document:\n${headings.slice(0, 100).map((h) => `- Page ${h.page}: ${h.title}`).join('\n')}`);
  }

  const definitions = blocks.filter((b) => b.type === 'definition');
  if (definitions.length) {
    parts.push(`Sample Core Terms:\n${definitions.slice(0, 30).map((d) => `- [${d.term}] (p.${d.page})`).join('\n')}`);
  }

  // Sample page previews distributed across the ENTIRE document (crucial for 500 slides)
  parts.push('Uniform Page Previews Across Entire Document:');
  const stride = Math.max(1, Math.floor(totalPages / 25));
  for (let i = 0; i < totalPages; i += stride) {
    const p = pages[i];
    if (!p) continue;
    const textSnippet = (p.text || '').slice(0, 160).replace(/\n/g, ' ');
    if (textSnippet.trim()) {
      parts.push(`Page ${p.page}: ${textSnippet}...`);
    }
  }

  return parts.join('\n\n');
}

export function buildDeterministicTopics(blocks, pages) {
  const totalPages = pages.length || 1;
  const headings = blocks.filter((b) => b.type === 'heading');

  // For lecture decks <= 60 pages: ~5 pages per thematic study unit; for 500 slides: ~25-35 topics.
  const targetCount = totalPages <= 60
    ? Math.max(2, Math.ceil(totalPages / 5))
    : Math.max(2, Math.min(40, Math.ceil(totalPages / 14)));

  // If we have distinct major headings that form a sensible number of topics (between 2 and 40)
  if (headings.length >= 2 && headings.length <= 40) {
    return headings.map((h, idx) => {
      const nextHeading = headings[idx + 1];
      const startPage = h.page;
      const endPage = nextHeading ? Math.max(startPage, nextHeading.page - 1) : totalPages;
      const pageList = [];
      for (let p = startPage; p <= endPage; p++) pageList.push(p);

      return {
        id: `topic_${idx + 1}`,
        title: h.title || `Topic ${idx + 1}`,
        description: `Comprehensive study unit covering foundational theory and applications for ${h.title}.`,
        sourcePages: pageList.length ? pageList : [startPage],
        subtopics: [],
        keyTerms: [],
        prerequisites: idx > 0 ? [headings[idx - 1].title] : [],
        order: idx + 1,
        blockIds: [],
      };
    });
  }

  // Otherwise (too many headings like 200 slide titles, or too few like 0 or 1),
  // partition the entire deck into targetCount contiguous cohesive ranges
  const topics = [];
  const pagesPerTopic = Math.max(1, Math.ceil(totalPages / targetCount));

  for (let i = 0; i < targetCount; i++) {
    const startP = i * pagesPerTopic + 1;
    const endP = Math.min(totalPages, (i + 1) * pagesPerTopic);
    if (startP > totalPages) break;

    const pageList = [];
    for (let p = startP; p <= endP; p++) pageList.push(p);

    const rangeBlocks = blocks.filter((b) => pageList.includes(b.page));
    const rangeHeading = rangeBlocks.find((b) => b.type === 'heading');
    const rangeSub = rangeBlocks.find((b) => b.type === 'subheading');
    const rangeDef = rangeBlocks.find((b) => b.type === 'definition');

    let title = rangeHeading?.title || rangeSub?.title;
    if (!title && rangeDef) {
      title = `${rangeDef.term} & Core Concepts`;
    }
    if (!title) {
      title = `Study Unit ${i + 1}: Core Principles (Pages ${startP}–${endP})`;
    }

    topics.push({
      id: `topic_${i + 1}`,
      title,
      description: `Structured study unit covering source lecture material across pages ${startP} through ${endP}.`,
      sourcePages: pageList,
      subtopics: rangeBlocks.filter((b) => b.type === 'subheading').map((b) => b.title).slice(0, 5),
      keyTerms: rangeBlocks.filter((b) => b.type === 'definition').map((b) => b.term).slice(0, 6),
      prerequisites: i > 0 ? [topics[i - 1]?.title || `Topic ${i}`] : [],
      order: i + 1,
      blockIds: [],
    });
  }

  return topics.length
    ? topics
    : [
        {
          id: 'topic_1',
          title: 'Course Study Module',
          description: 'Comprehensive study guide covering all lecture material.',
          sourcePages: [1],
          subtopics: [],
          keyTerms: [],
          prerequisites: [],
          order: 1,
          blockIds: [],
        },
      ];
}

function assignBlocksToTopics(topics, blocks) {
  for (const block of blocks) {
    // 1. Direct page match
    const matchingTopics = topics.filter((t) => t.sourcePages.includes(block.page));

    if (matchingTopics.length === 1) {
      matchingTopics[0].blockIds.push(block.id);
    } else if (matchingTopics.length > 1) {
      // Find closest topic by heading / title lexical match
      const scored = matchingTopics.map((t) => {
        let score = 0;
        const words = (t.title + ' ' + (t.subtopics || []).join(' ')).toLowerCase().split(/\s+/);
        for (const w of words) {
          if (w.length > 3 && block.content.toLowerCase().includes(w)) score++;
        }
        return { topic: t, score };
      });
      scored.sort((a, b) => b.score - a.score);
      scored[0].topic.blockIds.push(block.id);
    } else {
      // If block page not explicitly in sourcePages, attach to closest topic by page number
      let closestTopic = topics[0];
      let minDistance = 999999;
      for (const t of topics) {
        for (const p of t.sourcePages) {
          const dist = Math.abs(p - block.page);
          if (dist < minDistance) {
            minDistance = dist;
            closestTopic = t;
          }
        }
      }
      if (closestTopic) {
        closestTopic.blockIds.push(block.id);
        if (!closestTopic.sourcePages.includes(block.page)) {
          closestTopic.sourcePages.push(block.page);
          closestTopic.sourcePages.sort((a, b) => a - b);
        }
      }
    }
  }

  // Populate subtopics and keyTerms from assigned blocks if empty
  for (const t of topics) {
    const assigned = blocks.filter((b) => t.blockIds.includes(b.id));
    if (!t.keyTerms || !t.keyTerms.length) {
      t.keyTerms = assigned.filter((b) => b.type === 'definition').map((b) => b.term || b.title).slice(0, 10);
    }
    if (!t.subtopics || !t.subtopics.length) {
      t.subtopics = assigned.filter((b) => b.type === 'subheading').map((b) => b.title).slice(0, 8);
    }
  }
}
