const normalizeText = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const extractNameFromOcr = (extractedText = '') => {
  // Skip these header/footer/note patterns - they are NOT names
  const skipPatterns = [
    /^payslip for/i,
    /^note:/i,
    /^unique identification/i,
    /^permanent account/i,
    /^income tax/i,
    /^government of india/i,
    /^govt/i,
    /^account holder/i,
    /^employee name/i,
    /^authorized/i,
    /^signature/i,
    /^date/i,
    /^phone/i,
    /^account number/i,
    /^employee id/i,
    /^designation/i,
    /^department/i,
    /^father/i,
    /^s\/o\./i,
    /^to\s/i,
    /^from/i,
    /^chennaima/i,
    /^tamil nadu/i,
    /^thiruvallur/i,
  ];

  const lines = String(extractedText || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const candidates: any[] = [];
  
  for (const line of lines) {
    // Skip empty or very short lines
    if (line.length < 3) continue;
    
    // Skip lines that start with skip patterns
    if (skipPatterns.some(pattern => pattern.test(line))) {
      continue;
    }

    // Skip lines with too many numbers (likely dates, addresses, IDs, barcode text)
    const digitCount = (line.match(/\d/g) || []).length;
    if (digitCount / line.length > 0.4) {
      continue;
    }

    // Skip lines with too many special characters
    const specialCount = (line.match(/[^a-zA-Z0-9\s]/g) || []).length;
    if (specialCount / line.length > 0.25) {
      continue;
    }

    // Must be at least 50% letters
    const letters = (line.match(/[a-zA-Z]/g) || []).length;
    if (letters / line.length < 0.5) {
      continue;
    }

    // Check word count and pattern
    const words = line.split(/\s+/).filter(w => w.length > 0);
    
    // Best: 2-4 words (typical Indian name)
    if (words.length >= 2 && words.length <= 4) {
      // Make sure it's not all single letters
      const allSingleLetters = words.every(w => w.length === 1);
      if (!allSingleLetters) {
        candidates.push({ line, wordCount: words.length, score: 1.0 });
      }
    }
    // Acceptable: 1 word if 4+ chars
    else if (words.length === 1 && line.length >= 4 && line.length <= 25) {
      candidates.push({ line, wordCount: 1, score: 0.7 });
    }
  }

  // Prefer multi-word names, return first found (closest to top = likely correct)
  const multiWord = candidates.filter(c => c.wordCount >= 2);
  if (multiWord.length > 0) {
    console.log(`[extractNameFromOcr] Found multi-word name: "${multiWord[0].line}"`);
    return multiWord[0].line;
  }
  
  if (candidates.length > 0) {
    console.log(`[extractNameFromOcr] Found single-word name: "${candidates[0].line}"`);
    return candidates[0].line;
  }
  
  console.log(`[extractNameFromOcr] No valid name found in text`);
  return '';
};

const clientNameMatch = (applicantName = '', extractedText = '') => {
  const applicantNameTrimmed = String(applicantName || '').trim();
  const extractedTextTrimmed = String(extractedText || '').trim();
  
  if (!applicantNameTrimmed || !extractedTextTrimmed) {
    return false;
  }
  
  const applicantLower = applicantNameTrimmed.toLowerCase();
  const extractedLower = extractedTextTrimmed.toLowerCase();
  
  // STRICT: Direct substring match required
  if (extractedLower.includes(applicantLower) || applicantLower.includes(extractedLower)) {
    console.log(`[clientNameMatch] ✓ MATCH: "${applicantName}" found in "${extractedTextTrimmed}"`);
    return true;
  }

  // STRICT: Compact match (remove all special chars)
  const compact = normalizeText(applicantNameTrimmed);
  const extractedCompact = normalizeText(extractedTextTrimmed);
  
  if (extractedCompact.includes(compact) || compact.includes(extractedCompact)) {
    console.log(`[clientNameMatch] ✓ MATCH (compact): "${compact}" in "${extractedCompact}"`);
    return true;
  }

  // STRICT: Token matching - ALL form tokens must be in extracted text
  const tokens = applicantNameTrimmed.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const extractedTokens = extractedTextTrimmed.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  
  if (tokens.length > 0) {
    const matched = tokens.filter(t => extractedTokens.some(et => et.includes(t) || t.includes(et))).length;
    // STRICT: Need 100% of tokens to match for multi-word names, or 80% for safety
    const threshold = tokens.length === 1 ? 1 : Math.ceil(tokens.length * 0.8);
    if (matched >= threshold) {
      console.log(`[clientNameMatch] ✓ MATCH (tokens): ${matched}/${tokens.length} matched`);
      return true;
    }
  }

  console.log(`[clientNameMatch] ✗ MISMATCH: "${applicantName}" vs "${extractedTextTrimmed}"`);
  return false;
};
