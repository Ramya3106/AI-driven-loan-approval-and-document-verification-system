/**
 * Enhanced OCR Validation Module
 * Provides comprehensive document validation with name matching and income verification
 */

const normalizeText = (value = '') => {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

const normalizeWithSpaces = (value = '') =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenizeName = (value = '') =>
  normalizeWithSpaces(value)
    .split(' ')
    .filter((token) => token.length > 1);

const toPositiveNumber = (value = '') => {
  const digitsOnly = String(value).replace(/[^0-9]/g, '');
  const parsed = Number(digitsOnly);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * Extract annual income from salary slip text with context-aware detection
 * Looks for keywords like "annual", "salary", "ctc" and returns the largest number found
 */
const extractAnnualIncomeFromSalarySlip = (text = '') => {
  if (!text) return null;
  
  const lowerText = String(text).toLowerCase();
  const incomeKeywords = ['annual', 'yearly', 'salary', 'ctc', 'gross', 'net', 'income', 'total'];
  const hasIncomeContext = incomeKeywords.some(kw => lowerText.includes(kw));
  
  // Extract all numbers with 4+ digits
  const allNumbers = (String(text).match(/\d{4,}/g) || [])
    .map(num => Number(num.replace(/[^0-9]/g, '')))
    .filter(num => num > 0);
  
  if (!allNumbers.length) return null;
  
  // Filter by reasonable income range (100 to 50 million)
  const candidates = allNumbers.filter(num => num >= 100 && num <= 50000000);
  
  if (!candidates.length) return null;
  
  // With income context, prefer larger numbers (more likely annual vs monthly)
  return Math.max(...candidates);
};

/**
 * Perform strict name validation with multiple strategies
 * Returns object with { isMatch: boolean, confidence: number, reason: string }
 */
const validateNameMatch = (applicantName = '', extractedText = '') => {
  const applicantNameTrimmed = String(applicantName || '').trim();
  if (!applicantNameTrimmed) {
    return {
      isMatch: false,
      reason: 'Applicant name is missing from provided details.',
      confidence: 0,
    };
  }

  const extractedTextTrimmed = String(extractedText || '').trim();
  if (!extractedTextTrimmed || extractedTextTrimmed.length < 3) {
    return {
      isMatch: false,
      reason: 'Unable to read a valid name from OCR text.',
      confidence: 0,
    };
  }

  const applicantLower = applicantNameTrimmed.toLowerCase();
  const extractedLower = extractedTextTrimmed.toLowerCase();
  
  // Strategy 1: Direct substring match (case-insensitive)
  if (extractedLower.includes(applicantLower) || applicantLower.includes(extractedLower)) {
    console.log(`[validateNameMatch] ✓ Direct match: "${applicantNameTrimmed}" in extracted text`);
    return { isMatch: true, confidence: 0.95, reason: 'Name matched.' };
  }

  // Strategy 2: Compact match (all special chars removed)
  const expectedCompact = normalizeText(applicantNameTrimmed);
  const extractedCompact = normalizeText(extractedTextTrimmed);
  
  if (extractedCompact.includes(expectedCompact) || expectedCompact.includes(extractedCompact)) {
    console.log(`[validateNameMatch] ✓ Compact match: "${expectedCompact}" in "${extractedCompact}"`);
    return { isMatch: true, confidence: 0.9, reason: 'Name matched.' };
  }

  // Strategy 3: Token-based matching with 80%+ coverage
  const expectedTokens = tokenizeName(applicantNameTrimmed);
  const extractedTokens = tokenizeName(extractedTextTrimmed);
  
  if (expectedTokens.length > 0 && extractedTokens.length > 0) {
    const matchedCount = expectedTokens.filter((token) =>
      extractedTokens.some((eToken) => 
        eToken === token || 
        (eToken.includes(token) && token.length >= 3) ||
        (token.includes(eToken) && eToken.length >= 3)
      )
    ).length;

    const coverage = matchedCount / expectedTokens.length;
    
    if (coverage >= 0.8) {
      console.log(`[validateNameMatch] ✓ Token match: ${coverage.toFixed(2)} coverage`);
      return { isMatch: true, confidence: 0.8, reason: 'Name matched.' };
    }
  }

  console.log(`[validateNameMatch] ✗ No match: "${applicantNameTrimmed}" vs "${extractedTextTrimmed}"`);
  return {
    isMatch: false,
    confidence: 0,
    reason: 'Name extracted from document does not match the provided applicant name.',
  };
};

/**
 * Validate income match for salary slips
 * Handles annual vs monthly conversion and OCR digit variations
 */
const validateIncomeMatch = (expectedAnnualIncome = 0, extractedText = '') => {
  const expected = toPositiveNumber(expectedAnnualIncome);
  
  if (!expected) {
    return {
      isMatch: false,
      reason: 'Annual income is missing from application details.',
      confidence: 0,
    };
  }

  const numericCandidates = (String(extractedText).match(/\d{4,}/g) || [])
    .map(num => Number(num.replace(/[^0-9]/g, '')))
    .filter(num => num >= 100);
  
  if (!numericCandidates.length) {
    console.log(`[validateIncomeMatch] ✗ No numeric values found in text`);
    return {
      isMatch: false,
      reason: 'Unable to extract income value from OCR text.',
      confidence: 0,
    };
  }

  const tolerance = Math.max(1000, Math.round(expected * 0.15));

  for (const candidate of numericCandidates) {
    // Direct match
    if (Math.abs(candidate - expected) <= tolerance) {
      console.log(`[validateIncomeMatch] ✓ Direct match: ${candidate} ≈ ${expected}`);
      return { isMatch: true, confidence: 0.95, reason: 'Income matched.' };
    }

    // Monthly to annual conversion (candidate * 12)
    if (Math.abs((candidate * 12) - expected) <= tolerance) {
      console.log(`[validateIncomeMatch] ✓ Monthly-to-annual: ${candidate}*12 = ${candidate*12} ≈ ${expected}`);
      return { isMatch: true, confidence: 0.9, reason: 'Income matched (converted from monthly).' };
    }

    // Thousands conversion (candidate * 1000)
    if (Math.abs((candidate * 1000) - expected) <= tolerance) {
      console.log(`[validateIncomeMatch] ✓ Thousands conversion: ${candidate}*1000 = ${candidate*1000} ≈ ${expected}`);
      return { isMatch: true, confidence: 0.9, reason: 'Income matched (converted from thousands).' };
    }
  }

  console.log(`[validateIncomeMatch] ✗ No income match. Expected: ${expected}, Candidates: ${numericCandidates.join(',')}`);
  return {
    isMatch: false,
    reason: `Annual income mismatch. Expected: ${expected}, extracted candidates: ${numericCandidates.join(', ')}`,
    confidence: 0,
  };
};

/**
 * Comprehensive cross-document validation
 * Ensures all document names match the application form
 * For salary slips, also validates income
 */
const validateDocuments = (documents = [], applicantName = '', annualIncome = 0) => {
  if (!documents.length) {
    return {
      isValid: false,
      reason: 'No documents provided',
      results: {},
    };
  }

  if (!applicantName) {
    return {
      isValid: false,
      reason: 'Applicant name is required',
      results: {},
    };
  }

  const results = {};
  const failures = [];
  
  for (const doc of documents) {
    const { documentType = '', extractedText = '' } = doc;
    const normalizedType = normalizeText(documentType);
    const isSalarySlip = normalizedType.includes('salaryslip');
    
    const nameValidation = validateNameMatch(applicantName, extractedText);
    
    if (isSalarySlip) {
      // For salary slips: validate both name and income
      const incomeValidation = validateIncomeMatch(annualIncome, extractedText);
      const isValid = nameValidation.isMatch && incomeValidation.isMatch;
      
      results[documentType] = {
        type: 'salary_slip',
        nameMatches: nameValidation.isMatch,
        incomeMatches: incomeValidation.isMatch,
        isValid: isValid,
        nameReason: nameValidation.reason,
        incomeReason: incomeValidation.reason,
      };
      
      if (!isValid) {
        failures.push(`Salary Slip: ${nameValidation.isMatch ? '' : nameValidation.reason} ${incomeValidation.isMatch ? '' : incomeValidation.reason}`.trim());
      }
    } else {
      // For other documents: validate name match only
      results[documentType] = {
        type: 'document',
        nameMatches: nameValidation.isMatch,
        isValid: nameValidation.isMatch,
        nameReason: nameValidation.reason,
      };
      
      if (!nameValidation.isMatch) {
        failures.push(`${documentType}: ${nameValidation.reason}`);
      }
    }
  }

  const isValid = Object.values(results).every(r => r.isValid);
  
  return {
    isValid,
    reason: isValid ? 'All documents verified successfully' : `Verification failed: ${failures.join('; ')}`,
    results,
    failureCount: failures.length,
  };
};

module.exports = {
  extractAnnualIncomeFromSalarySlip,
  validateNameMatch,
  validateIncomeMatch,
  validateDocuments,
  normalizeText,
  toPositiveNumber,
};
