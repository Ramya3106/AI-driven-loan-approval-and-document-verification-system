// New extractNameFromOcr function - properly extracts person names
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

  const candidates = [];
  
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
    return multiWord[0].line;
  }
  
  if (candidates.length > 0) {
    return candidates[0].line;
  }
  
  return '';
};

console.log('New extraction function defined');
