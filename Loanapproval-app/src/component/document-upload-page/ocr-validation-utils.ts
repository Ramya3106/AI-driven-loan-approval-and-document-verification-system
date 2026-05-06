/**
 * Client-side OCR Validation Utilities
 * Enhanced name extraction and validation for document upload
 */

// Normalize text for matching
export const normalizeText = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Extract single name from OCR text with pattern matching
export const extractNameFromDocumentOcr = (extractedText = '') => {
  if (!extractedText) return '';

  // Patterns that explicitly appear before names
  const namePatterns = [
    /name\s*[:\-=]+\s*([a-z\s]+?)(?:\n|$)/i,
    /applicant\s*[:\-=]+\s*([a-z\s]+?)(?:\n|$)/i,
    /employee\s+name\s*[:\-=]*\s*([a-z\s]+?)(?:\n|$)/i,
    /account\s+holder\s*[:\-=]*\s*([a-z\s]+?)(?:\n|$)/i,
  ];

  // Try each pattern
  for (const pattern of namePatterns) {
    const match = extractedText.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (isValidNameCandidate(candidate)) {
        console.log(`[extractNameFromDocumentOcr] Pattern matched: "${candidate}"`);
        return candidate;
      }
    }
  }

  // If patterns don't work, look for valid name-like lines
  const lines = String(extractedText || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && line.length < 80);

  // Header/footer patterns to skip
  const skipPatterns = [
    /^payslip/i,
    /^salary/i,
    /^note:/i,
    /^unique\s+identification/i,
    /^permanent\s+account/i,
    /^income\s+tax/i,
    /^government/i,
    /^photo/i,
    /^authorized/i,
    /^signature/i,
    /^date/i,
    /^phone/i,
    /^account\s+number/i,
    /^ifsc/i,
    /^micr/i,
    /^qr\s+code/i,
    /^sample/i,
    /^academic/i,
    /^project/i,
    /^page\s+\d/i,
  ];

  // Find candidate lines
  const candidates = [];
  for (const line of lines) {
    // Skip empty or very short lines
    if (line.length < 3) continue;

    // Skip if matches skip patterns
    if (skipPatterns.some(p => p.test(line))) continue;

    // Skip lines with mostly digits (dates, IDs, amounts)
    const digitRatio = (line.match(/\d/g) || []).length / line.length;
    if (digitRatio > 0.4) continue;

    // Skip lines with too many special characters
    const specialRatio = (line.match(/[^a-zA-Z0-9\s]/g) || []).length / line.length;
    if (specialRatio > 0.3) continue;

    if (isValidNameCandidate(line)) {
      candidates.push(line);
    }
  }

  // Prefer names with 2+ words (more likely to be full names)
  const fullNames = candidates.filter(c => c.split(/\s+/).length >= 2);
  if (fullNames.length > 0) {
    console.log(`[extractNameFromDocumentOcr] Found full name: "${fullNames[0]}"`);
    return fullNames[0];
  }

  if (candidates.length > 0) {
    console.log(`[extractNameFromDocumentOcr] Found candidate: "${candidates[0]}"`);
    return candidates[0];
  }

  console.log('[extractNameFromDocumentOcr] No valid name found');
  return '';
};

// Validate if text looks like a real name
const isValidNameCandidate = (text = '') => {
  if (!text || text.length < 2 || text.length > 80) return false;

  const trimmed = text.trim();

  // Must have mostly letters (at least 50%)
  const letterCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (letterCount / trimmed.length < 0.5) return false;

  // Must have consonants and vowels (real words)
  const hasVowels = /[aeiouAEIOU]/.test(trimmed);
  const hasConsonants = /[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/.test(trimmed);
  if (!hasVowels || !hasConsonants) return false;

  // Should not be all caps and all lowercase mixed in weird patterns
  const isAllUpper = trimmed === trimmed.toUpperCase();
  const isAllLower = trimmed === trimmed.toLowerCase();
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  
  // For multi-word names, expect at least some capitalization
  if (words.length >= 2 && isAllLower) return false;

  return true;
};

// Strict name matching with multiple strategies
export const clientNameMatch = (applicantName = '', extractedText = '') => {
  const applicantNameTrimmed = String(applicantName || '').trim();
  const extractedTextTrimmed = String(extractedText || '').trim();

  if (!applicantNameTrimmed || !extractedTextTrimmed) return false;

  const applicantLower = applicantNameTrimmed.toLowerCase();
  const extractedLower = extractedTextTrimmed.toLowerCase();

  // Strategy 1: Direct substring match
  if (extractedLower.includes(applicantLower) || applicantLower.includes(extractedLower)) {
    console.log(`[clientNameMatch] ✓ Direct match: "${applicantName}" in extracted text`);
    return true;
  }

  // Strategy 2: Compact match (remove all special chars)
  const compact = normalizeText(applicantNameTrimmed);
  const extractedCompact = normalizeText(extractedTextTrimmed);

  if (extractedCompact.includes(compact) || compact.includes(extractedCompact)) {
    console.log(`[clientNameMatch] ✓ Compact match: "${compact}" in "${extractedCompact}"`);
    return true;
  }

  // Strategy 3: Token-based matching with 80%+ coverage
  const tokens = applicantLower.split(/\s+/).filter(t => t.length > 1);
  const extractedTokens = extractedLower.split(/\s+/).filter(t => t.length > 1);

  if (tokens.length > 0 && extractedTokens.length > 0) {
    const matched = tokens.filter(t =>
      extractedTokens.some(et =>
        et === t ||
        (et.includes(t) && t.length >= 3) ||
        (t.includes(et) && et.length >= 3)
      )
    ).length;

    const coverage = matched / tokens.length;

    if (coverage >= 0.8) {
      console.log(`[clientNameMatch] ✓ Token match: ${coverage.toFixed(2)} coverage`);
      return true;
    }
  }

  console.log(`[clientNameMatch] ✗ No match for "${applicantName}"`);
  return false;
};

// Match annual income from extracted text
export const clientIncomeMatch = (expectedAnnual = 0, extractedText = '') => {
  const numStr = String(expectedAnnual || '').trim();
  if (!numStr) return false;

  const expected = Number(numStr.replace(/[^0-9.]/g, '')) || 0;
  if (!expected) return false;

  // Extract all multi-digit numbers from text
  const numericCandidates = (String(extractedText || '').match(/\d+/g) || [])
    .map(s => Number(s))
    .filter(n => n > 0);

  if (!numericCandidates.length) {
    console.log(`[clientIncomeMatch] ✗ No numbers found in extracted text`);
    return false;
  }

  console.log(`[clientIncomeMatch] expected=${expected}, candidates=[${numericCandidates.join(',')}]`);

  for (const cand of numericCandidates) {
    if (!cand) continue;
    const tolerance = Math.max(1000, Math.round(expected * 0.15));

    // Direct match
    if (Math.abs(cand - expected) <= tolerance) {
      console.log(`[clientIncomeMatch] ✓ Direct match: ${cand} ≈ ${expected}`);
      return true;
    }

    // Monthly to annual: candidate * 12
    if (Math.abs((cand * 12) - expected) <= tolerance) {
      console.log(`[clientIncomeMatch] ✓ Monthly match: ${cand}*12 = ${cand * 12} ≈ ${expected}`);
      return true;
    }

    // Thousands to actual: candidate * 1000
    if (Math.abs((cand * 1000) - expected) <= tolerance) {
      console.log(`[clientIncomeMatch] ✓ Thousands match: ${cand}*1000 = ${cand * 1000} ≈ ${expected}`);
      return true;
    }
  }

  console.log(`[clientIncomeMatch] ✗ No income match for expected=${expected}`);
  return false;
};

// Cross-document verification - ensure all names are consistent
export const verifyAllDocumentsMatch = (formName = '', extractedNames = {}) => {
  if (!formName || !String(formName).trim()) {
    return { allMatch: true, reason: 'No documents uploaded yet' };
  }

  const formNameLower = String(formName).trim().toLowerCase();
  const extracted = Object.entries(extractedNames)
    .filter(([_, name]) => name && String(name).trim())
    .map(([doc, name]) => ({
      doc,
      name: String(name).trim(),
      matches: clientNameMatch(formName, String(name)),
    }));

  if (extracted.length === 0) {
    return { allMatch: true, reason: 'No documents uploaded yet' };
  }

  const mismatches = extracted.filter(e => !e.matches);

  if (mismatches.length > 0) {
    const details = mismatches.map(m => `${m.doc}: "${m.name}"`).join('; ');
    return {
      allMatch: false,
      reason: `Name mismatch in documents: ${details}. Expected: "${formName}"`,
      mismatches: extracted.filter(e => !e.matches),
    };
  }

  return {
    allMatch: true,
    reason: `All ${extracted.length} document(s) verified: names match`,
    matches: extracted,
  };
};
