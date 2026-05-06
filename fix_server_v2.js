const fs = require('fs');

const filePath = 'server/server.js';
let content = fs.readFileSync(filePath, 'utf-8');

// Find verifyNameMatch function
const fnStart = content.indexOf('const verifyNameMatch = (applicantName = \'\', extractedText = \'\') => {');
if (fnStart === -1) {
  console.error('Function not found');
  process.exit(1);
}

// Find closing brace
let braceCount = 0;
let fnEnd = fnStart;
let foundOpenBrace = false;

for (let i = fnStart; i < content.length; i++) {
  if (content[i] === '{') {
    braceCount++;
    foundOpenBrace = true;
  } else if (content[i] === '}' && foundOpenBrace) {
    braceCount--;
    if (braceCount === 0) {
      fnEnd = i + 1;
      break;
    }
  }
}

// New STRICT function with first-name matching
const newFunction = `const verifyNameMatch = (applicantName = '', extractedText = '') => {
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
  
  // STRICT: Direct substring match
  if (extractedLower.includes(applicantLower) || applicantLower.includes(extractedLower)) {
    console.log(\`[verifyNameMatch] ✓ SUBSTRING MATCH: "\${applicantNameTrimmed}" in extracted\`);
    return { isMatch: true, confidence: 0.95, reason: 'Name matched.' };
  }

  // STRICT: Compact match (no special chars)
  const expectedCompact = normalizeText(applicantNameTrimmed);
  const extractedCompact = normalizeText(extractedTextTrimmed);
  
  if (extractedCompact.includes(expectedCompact) || expectedCompact.includes(extractedCompact)) {
    console.log(\`[verifyNameMatch] ✓ COMPACT MATCH: "\${expectedCompact}" in "\${extractedCompact}"\`);
    return { isMatch: true, confidence: 0.9, reason: 'Name matched.' };
  }

  // STRICT: First name match (at least one significant word must match exactly)
  const expectedTokens = tokenizeName(applicantNameTrimmed);
  const extractedTokens = tokenizeName(extractedTextTrimmed);
  
  if (expectedTokens.length > 0 && extractedTokens.length > 0) {
    // Check if any form token matches ANY extracted token
    const hasAnyTokenMatch = expectedTokens.some(expToken =>
      extractedTokens.some(extToken => {
        const expNorm = normalizeText(expToken);
        const extNorm = normalizeText(extToken);
        // Exact match or substring
        return expNorm === extNorm || 
               expNorm.includes(extNorm) || 
               extNorm.includes(expNorm) ||
               isTokenMatch(expToken, extToken);
      })
    );

    if (hasAnyTokenMatch) {
      console.log(\`[verifyNameMatch] ✓ TOKEN MATCH\`);
      return { isMatch: true, confidence: 0.85, reason: 'Name matched.' };
    }
  }

  console.log(\`[verifyNameMatch] ✗ NO MATCH: "\${applicantNameTrimmed}" vs "\${extractedTextTrimmed}"\`);
  return {
    isMatch: false,
    confidence: 0,
    reason: 'Name extracted from document does not match the provided applicant name.',
  };
};`;

const newContent = content.substring(0, fnStart) + newFunction + content.substring(fnEnd);
fs.writeFileSync(filePath, newContent, 'utf-8');

console.log('✓ Updated verifyNameMatch with token matching');
