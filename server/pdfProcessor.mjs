import pdfParse from 'pdf-parse';
import { randomUUID } from 'node:crypto';

function collapseSpacedTokenRun(run) {
  const joined = run.replace(/\s+/g, '');
  const commonSplitWords = [
    'PRACTICAL', 'OPEN', 'SOURCE', 'LEARNING', 'OBJECTIVES', 'MODULE', 'PART',
    'LICENSE', 'LICENSES', 'CATEGORIES', 'PERMISSIVE', 'COPYLEFT', 'CHOOSING',
    'APPLYING', 'COMMUNITY', 'HEALTHY', 'CONTRIBUTION', 'WORKFLOW', 'GOVERNANCE',
    'MODELS', 'QUICK', 'REFERENCE', 'SUMMARY', 'INTRODUCTION', 'OVERVIEW',
    'CHAPTER', 'LECTURE', 'SECTION', 'SECURITY', 'NETWORK', 'ARCHITECTURE',
  ];
  let result = joined;
  for (const w of commonSplitWords) {
    result = result.replace(new RegExp(w, 'g'), ` ${w} `);
  }
  result = result.replace(/([A-Z])(\d+)/g, '$1 $2').replace(/(\d+)([A-Z])/g, '$1 $2');
  return result.replace(/\s+/g, ' ').trim();
}

export function normalizeSpacedText(text) {
  if (!text) return '';
  return text.replace(/\b(?:[A-Z0-9]\s+){3,}[A-Z0-9]\b/g, (match) => collapseSpacedTokenRun(match));
}

export function cleanPdfText(text) {
  if (!text) return '';
  return normalizeSpacedText(text)
    .replace(/(?:page\s*\d+\s*(?:of|\/)\s*\d+|\b\d+\s*\/\s*\d+\b)/gi, '')
    .replace(/^(?:slide|page)\s*\d+$/gim, '')
    .replace(/^\s*\d{1,3}\s*$/gm, '')
    .replace(/^[\s\-_=*#]{3,}$/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeText(value = '') {
  return String(value)
    .replace(/\0/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts and structures PDF document content into typed semantic blocks
 * (headings, paragraphs, bullet points, tables, code, equations, definitions).
 */
export async function extractDocumentContent(buffer, filename = 'document.pdf', mimetype = 'application/pdf') {
  let pages = [];
  let pageCount = 1;
  let isScanned = false;

  if (mimetype === 'application/pdf' && buffer) {
    try {
      const parsedData = await pdfParse(buffer, {
        pagerender: async (pageData) => {
          const content = await pageData.getTextContent({ normalizeWhitespace: true });
          const lines = [];
          let currentLine = '';
          let lastY = null;
          for (const item of content.items) {
            const str = item.str || '';
            const y = item.transform ? Math.round(item.transform[5]) : null;
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
              if (currentLine.trim()) lines.push(currentLine.trim());
              currentLine = str;
            } else {
              currentLine += (currentLine && !currentLine.endsWith(' ') && !str.startsWith(' ') ? ' ' : '') + str;
            }
            if (y !== null) lastY = y;
          }
          if (currentLine.trim()) lines.push(currentLine.trim());
          const rawText = lines.join('\n');
          const cleaned = cleanPdfText(rawText);
          const pageNum = pages.length + 1;
          pages.push({
            page: pageNum,
            text: cleaned,
            rawText,
            itemCount: content.items.length,
          });
          return cleaned;
        },
      });
      pageCount = parsedData.numpages || pages.length || 1;
    } catch (err) {
      console.warn('[PDF Extract Warning]:', err.message);
      // Fallback
      pages = [{ page: 1, text: cleanPdfText(buffer.toString('utf8')), rawText: '', itemCount: 10 }];
    }
  } else {
    const raw = typeof buffer === 'string' ? buffer : buffer.toString('utf8');
    const cleaned = cleanPdfText(sanitizeText(raw));
    pages = [{ page: 1, text: cleaned, rawText: raw, itemCount: cleaned.length }];
    pageCount = 1;
  }

  // Filter out completely blank pages
  if (pages.length === 0) {
    pages.push({ page: 1, text: '', rawText: '', itemCount: 0 });
  }

  // Strip repeated running slide headers/footers across pages (e.g., "Course Name | Module 4: ...")
  if (pages.length >= 4) {
    const linePageFreq = new Map();
    for (const p of pages) {
      const uniquePageLines = new Set(
        (p.text || '')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length >= 5 && l.length <= 120)
      );
      for (const l of uniquePageLines) {
        linePageFreq.set(l, (linePageFreq.get(l) || 0) + 1);
      }
    }
    const minRepeatPages = Math.max(3, Math.ceil(pages.length * 0.25));
    const repeatedRunningLines = new Set(
      [...linePageFreq.entries()].filter(([, count]) => count >= minRepeatPages).map(([line]) => line)
    );
    if (repeatedRunningLines.size > 0) {
      for (const p of pages) {
        const filtered = (p.text || '')
          .split('\n')
          .filter((l) => !repeatedRunningLines.has(l.trim()))
          .join('\n')
          .trim();
        if (filtered.length > 0) {
          p.text = filtered;
        }
      }
    }
  }

  // Check if document appears scanned (average characters per page is extremely low)
  const totalChars = pages.reduce((sum, p) => sum + (p.text?.length || 0), 0);
  const avgCharsPerPage = totalChars / (pages.length || 1);
  if (avgCharsPerPage < 40 && pages.length > 0) {
    isScanned = true;
  }

  const blocks = extractStructuredBlocks(pages);

  const headingsCount = blocks.filter((b) => b.type === 'heading' || b.type === 'subheading').length;
  const tablesCount = blocks.filter((b) => b.type === 'table').length;
  const equationsCount = blocks.filter((b) => b.type === 'equation').length;
  const definitionsCount = blocks.filter((b) => b.type === 'definition').length;

  return {
    pages,
    blocks,
    pageCount,
    isScanned,
    summaryText: pages.map((p) => p.text).join('\n\n'),
    stats: {
      totalBlocks: blocks.length,
      headingsCount,
      tablesCount,
      equationsCount,
      definitionsCount,
      avgCharsPerPage: Math.round(avgCharsPerPage),
    },
  };
}

// Helper detection functions
function isHeadingLine(line, nextLine) {
  if (/^(?:MARKDOWN|BASH|TEXT|JSON|YAML|HTML|CSS|PYTHON|JAVASCRIPT|TYPESCRIPT|SQL|SHELL|SH|C|CPP|JAVA|GO|RUST)$/i.test(line.trim())) {
    return false;
  }
  if (/^#{1,4}\s+/.test(line)) return true;
  if (/^(?:Chapter|Lecture|Unit|Section|Module|Part|المحاضرة|الفصل|الوحدة|القسم)\s+[\dIVX]+/i.test(line)) return true;
  if (line.length < 65 && line.endsWith(':')) return true;
  // All uppercase short line (e.g. "INTRODUCTION TO NETWORKS")
  if (line.length >= 4 && line.length <= 50 && line === line.toUpperCase() && /[A-Z]/.test(line)) return true;
  // Short title followed by text
  if (line.length < 55 && !line.endsWith('.') && !line.endsWith(',') && nextLine && nextLine.length > line.length) {
    if (/^[A-Z][A-Za-z0-9\s\-–]{3,50}$/.test(line)) return true;
  }
  return false;
}

function isMajorHeading(line) {
  if (/^#{1,2}\s+/.test(line)) return true;
  if (/^(?:Chapter|Lecture|Unit|Module|Part|المحاضرة|الفصل|الوحدة)\s+[\dIVX]+/i.test(line)) return true;
  if (line.length <= 40 && line === line.toUpperCase() && /[A-Z]/.test(line)) return true;
  return false;
}

function isBulletLine(line) {
  return /^(?:[\*\-•➢▪✓▫]|\d{1,2}[\.\)]|\([a-zA-Z0-9]\)|[a-zA-Z][\.\)])\s+/.test(line);
}

function isTableBlock(lines) {
  return lines.filter((l) => l.includes('|') || isTableRow(l)).length >= 2;
}

function isTableRow(line) {
  if (line.includes('|')) return true;
  // Check for tab or 2+ consecutive spaces separating words
  const parts = line.split(/\t|\s{2,}/).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 && line.length < 120;
}

function parseTableLines(lines) {
  const rows = [];
  let headers = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx];
    if (/^[\s\-|:]+$/.test(l)) continue; // markdown divider line
    const cells = l
      .split('|')
      .map((c) => c.trim())
      .filter((c, i, arr) => (i === 0 && c === '' ? false : i === arr.length - 1 && c === '' ? false : true));

    const finalCells = cells.length >= 2 ? cells : l.split(/\t|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (finalCells.length >= 2) {
      if (headers.length === 0) headers = finalCells;
      else rows.push(finalCells);
    }
  }

  if (headers.length === 0 && rows.length > 0) {
    headers = rows.shift();
  }

  return {
    headers: headers.length ? headers : [],
    rows,
  };
}

function isCodeLine(line) {
  return /^(?:const|let|var|function|def|class|import|from|export|public|private|protected|return|if\s*\(|for\s*\(|while\s*\(|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|#include|package)\b/.test(
    line
  ) || /[{};=>]$/.test(line) || /^\s{4,}/.test(line);
}

function isEquationLine(line) {
  if (!line) return false;
  if (/^\${1,2}[^\$]+\${1,2}$/.test(line)) return true;
  if (/\\(?:frac|sum|int|sqrt|alpha|beta|theta|partial|sigma|mu|lambda|pi)/.test(line)) return true;
  if (/^(?:formula|equation)\s*:\s*.+/i.test(line)) return true;
  if (/^[a-zA-Z][a-zA-Z0-9_]*\s*=\s*.+$/.test(line) && /[\+\-\*\/\\^√∑∫±≈×÷]/.test(line)) return true;
  return false;
}

function extractDefinition(line) {
  if (!line || line.length > 300) return null;

  // 1. Colon-delimited: "Term: Explanation" or "Definition: Term is ..."
  const colonIdx = line.indexOf(':');
  if (colonIdx > 1 && colonIdx < 50) {
    let term = line.slice(0, colonIdx).trim();
    let meaning = line.slice(colonIdx + 1).trim();

    if (/^definition$/i.test(term)) {
      // e.g. "Definition: Term is XYZ"
      const subColon = meaning.indexOf(':');
      if (subColon > 1 && subColon < 40) {
        term = meaning.slice(0, subColon).trim();
        meaning = meaning.slice(subColon + 1).trim();
      } else {
        const isMatch = meaning.match(/^([A-Za-z0-9\s\-]{2,35})\s+(?:is|refers to|represents)\s+(.+)$/i);
        if (isMatch) {
          term = isMatch[1].trim();
          meaning = isMatch[2].trim();
        }
      }
    }

    term = term.replace(/^(?:تعريف|مفهوم)\s+/i, '').trim();

    if (
      term.length >= 2 &&
      meaning.length >= 8 &&
      !/^(?:note|warning|chapter|lecture|module|part|section|unit|slide|topic|example|figure|table|page)\b/i.test(term)
    ) {
      return { term, meaning };
    }
  }

  // 2. English phrase: "Term is defined as XYZ"
  const phraseMatch = line.match(/^([A-Z][a-zA-Z0-9_\s]{2,40})\s+(?:is defined as|refers to|is the process of)\s+(.+)$/i);
  if (phraseMatch) {
    return { term: phraseMatch[1].trim(), meaning: phraseMatch[2].trim() };
  }

  // 3. Arabic definition phrase
  const matchAr = line.match(/^([^:：]{2,35})[:：]\s*(?:هو|هي|عبارة عن|يُعرّف بأنه)\s+(.+)$/);
  if (matchAr) {
    return { term: matchAr[1].trim(), meaning: matchAr[2].trim() };
  }

  return null;
}

export function extractStructuredBlocks(pages = []) {
  const blocks = [];
  let globalBlockIndex = 0;

  for (const pageInfo of pages) {
    const pageNum = pageInfo.page;
    const pageText = pageInfo.text || '';

    if (pageText.trim().length < 20) {
      globalBlockIndex++;
      blocks.push({
        id: `block_p${pageNum}_${globalBlockIndex}`,
        page: pageNum,
        type: 'diagram',
        title: `Visual Content / Slide Page ${pageNum}`,
        content: `Page ${pageNum} contains visual or scanned content (diagrams, visual slides, or handwriting). OCR note: Text extraction was sparse, original visual layout preserved.`,
        uncertain: true,
        metadata: { isVisualSlide: true, length: pageText.length },
      });
      continue;
    }

    const rawLines = pageText.split('\n').map((l) => l.trim()).filter(Boolean);
    let i = 0;

    while (i < rawLines.length) {
      const line = rawLines[i];

      // 1. Table Detection (must have at least 2 consecutive table lines and >=1 data row)
      if ((line.includes('|') || isTableRow(line)) && i + 1 < rawLines.length && (rawLines[i + 1].includes('|') || isTableRow(rawLines[i + 1]))) {
        const startIdx = i;
        const tableLines = [];
        while (i < rawLines.length && (rawLines[i].includes('|') || isTableRow(rawLines[i]))) {
          tableLines.push(rawLines[i]);
          i++;
        }
        const parsedTable = parseTableLines(tableLines);
        if (tableLines.length >= 2 && parsedTable.headers.length >= 2 && parsedTable.rows.length >= 1) {
          globalBlockIndex++;
          blocks.push({
            id: `block_p${pageNum}_${globalBlockIndex}`,
            page: pageNum,
            type: 'table',
            title: parsedTable.title || `Data Table (Page ${pageNum})`,
            content: tableLines.join('\n'),
            tableData: parsedTable,
            uncertain: false,
          });
          continue;
        }
        // Not a real table (e.g. a single header with a pipe) - rewind and process normally
        i = startIdx;
      }

      // 2. Code Snippet Detection
      if (isCodeLine(line) && (i + 1 < rawLines.length && isCodeLine(rawLines[i + 1]))) {
        const codeLines = [];
        while (i < rawLines.length && isCodeLine(rawLines[i])) {
          codeLines.push(rawLines[i]);
          i++;
        }
        globalBlockIndex++;
        blocks.push({
          id: `block_p${pageNum}_${globalBlockIndex}`,
          page: pageNum,
          type: 'code',
          title: `Code Snippet (Page ${pageNum})`,
          content: codeLines.join('\n'),
          uncertain: false,
        });
        continue;
      }

      // 3. Mathematical Equation Detection
      if (isEquationLine(line)) {
        globalBlockIndex++;
        blocks.push({
          id: `block_p${pageNum}_${globalBlockIndex}`,
          page: pageNum,
          type: 'formula',
          title: `Mathematical Formula (Page ${pageNum})`,
          content: line,
          uncertain: false,
        });
        i++;
        continue;
      }

      // 4. Definition Detection (supports multi-line wrapped definitions and "Term:\nMeaning")
      let defMatch = extractDefinition(line);
      if (!defMatch && line.endsWith(':') && line.length >= 3 && line.length <= 55 && i + 1 < rawLines.length) {
        const termCandidate = line.slice(0, -1).replace(/[:\s]+$/, '').trim();
        const nextL = rawLines[i + 1];
        if (
          termCandidate.length >= 2 &&
          !/^(?:note|warning|chapter|lecture|example|examples|figure|table|page|methods include|they can be protected using)$/i.test(termCandidate) &&
          nextL &&
          !isBulletLine(nextL) &&
          !isHeadingLine(nextL)
        ) {
          defMatch = { term: termCandidate, meaning: nextL, consumedNext: true };
        }
      }
      if (defMatch) {
        if (defMatch.consumedNext) i += 2;
        else i += 1;
        let fullMeaning = defMatch.meaning || defMatch.definition || line;
        while (
          i < rawLines.length &&
          !isHeadingLine(rawLines[i], rawLines[i + 1]) &&
          !isBulletLine(rawLines[i]) &&
          !rawLines[i].includes('|') &&
          !isEquationLine(rawLines[i]) &&
          !extractDefinition(rawLines[i]) &&
          !(rawLines[i].endsWith(':') && rawLines[i].length <= 55)
        ) {
          fullMeaning += ' ' + rawLines[i];
          i++;
        }
        globalBlockIndex++;
        blocks.push({
          id: `block_p${pageNum}_${globalBlockIndex}`,
          page: pageNum,
          type: 'definition',
          title: defMatch.term,
          content: fullMeaning.trim(),
          term: defMatch.term,
          uncertain: false,
        });
        continue;
      }

      // 5. Heading Detection
      if (isHeadingLine(line, rawLines[i + 1])) {
        globalBlockIndex++;
        let headingTitle = line.replace(/^#+\s*/, '').trim();
        const isAllCapsEyebrow =
          headingTitle.length <= 48 &&
          headingTitle === headingTitle.toUpperCase() &&
          /[A-Z]/.test(headingTitle);
        if (
          isAllCapsEyebrow &&
          i + 1 < rawLines.length &&
          !isBulletLine(rawLines[i + 1]) &&
          rawLines[i + 1].length <= 65 &&
          !rawLines[i + 1].endsWith('.') &&
          /^[A-Z0-9]/.test(rawLines[i + 1])
        ) {
          const nextTitle = rawLines[i + 1].replace(/^#+\s*/, '').trim();
          headingTitle = nextTitle;
          i += 2;
        } else {
          i += 1;
        }
        const isSub = line.startsWith('###') || /^[a-z]\)/i.test(line);
        blocks.push({
          id: `block_p${pageNum}_${globalBlockIndex}`,
          page: pageNum,
          type: isSub ? 'subheading' : 'heading',
          title: headingTitle,
          content: headingTitle,
          uncertain: false,
        });
        continue;
      }

      // 6. Bullet Point Detection (supports multi-line wrapped bullets)
      if (isBulletLine(line)) {
        const bulletPoints = [];
        while (i < rawLines.length && isBulletLine(rawLines[i])) {
          let currentBullet = rawLines[i].replace(/^(?:[\*\-•➢▪✓▫]|\d{1,2}[\.\)]|\([a-zA-Z0-9]\)|[a-zA-Z][\.\)])\s+/, '').trim();
          i++;
          while (
            i < rawLines.length &&
            !isBulletLine(rawLines[i]) &&
            !isHeadingLine(rawLines[i], rawLines[i + 1]) &&
            !rawLines[i].includes('|') &&
            !isEquationLine(rawLines[i]) &&
            !extractDefinition(rawLines[i]) &&
            !(rawLines[i].endsWith(':') && rawLines[i].length <= 55)
          ) {
            currentBullet += ' ' + rawLines[i].trim();
            i++;
          }
          if (currentBullet) bulletPoints.push(currentBullet);
        }
        globalBlockIndex++;
        blocks.push({
          id: `block_p${pageNum}_${globalBlockIndex}`,
          page: pageNum,
          type: 'bullet',
          title: `Key Points (Page ${pageNum})`,
          content: bulletPoints.join('\n'),
          points: bulletPoints,
          uncertain: false,
        });
        continue;
      }

      // 7. Standard Paragraph / Continuous Explanation Block
      const paraLines = [line];
      i++;
      while (
        i < rawLines.length &&
        !isHeadingLine(rawLines[i]) &&
        !isBulletLine(rawLines[i]) &&
        !rawLines[i].includes('|') &&
        !isEquationLine(rawLines[i]) &&
        !extractDefinition(rawLines[i])
      ) {
        paraLines.push(rawLines[i]);
        if (paraLines.length > 5) break;
        i++;
      }

      globalBlockIndex++;
      const fullPara = paraLines.join(' ');
      blocks.push({
        id: `block_p${pageNum}_${globalBlockIndex}`,
        page: pageNum,
        type: 'paragraph',
        title: paraLines[0].slice(0, 45) + (paraLines[0].length > 45 ? '...' : ''),
        content: fullPara,
        uncertain: fullPara.length < 15,
      });
    }
  }

  return blocks;
}
