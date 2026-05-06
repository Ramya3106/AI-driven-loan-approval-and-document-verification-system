const fs = require('fs');

const filePath = 'server/server.js';
let content = fs.readFileSync(filePath, 'utf-8');

// Find and replace verifyNameMatch function
const fnStart = content.indexOf('const verifyNameMatch = (applicantName = \'\', extractedText = \'\') => {');
if (fnStart === -1) {
  console.error('verifyNameMatch not found');
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

console.log('Found verifyNameMatch from', fnStart, 'to', fnEnd);

// New STRICT verification function
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
  
  // STRICT: Check direct substring match first
  if (extractedLower.includes(applicantLower) || applicantLower.includes(extractedLower)) {
    console.log(\`[verifyNameMatch] MATCH: "\${applicantNameTrimmed}" in extracted text\`);
    return { isMatch: true, confidence: 0.95, reason: 'Name matched.' };
  }

  // STRICT: Check compact match (all special chars removed)
  const expectedCompact = normalizeText(applicantNameTrimmed);
  const extractedCompact = normalizeText(extractedTextTrimmed);
  
  if (extractedCompact.includes(expectedCompact) || expectedCompact.includes(extractedCompact)) {
    console.log(\`[verifyNameMatch] COMPACT MATCH: "\${expectedCompact}" in "\${extractedCompact}"\`);
    return { isMatch: true, confidence: 0.9, reason: 'Name matched.' };
  }

  // STRICT: Check token matching - need 80%+ of tokens
  const expectedTokens = tokenizeName(applicantNameTrimmed);
  const extractedTokens = tokenizeName(extractedTextTrimmed);
  
  if (expectedTokens.length > 0 && extractedTokens.length > 0) {
    const matchedTokenCount = expectedTokens.filter((expectedToken) =>
      extractedTokens.some((candidateToken) => isTokenMatch(expectedToken, candidateToken))
    ).length;

    const tokenCoverage = matchedTokenCount / expectedTokens.length;
    
    if (tokenCoverage >= 0.8) {
      console.log(\`[verifyNameMatch] TOKEN MATCH: \${tokenCoverage.toFixed(2)} coverage\`);
      return { isMatch: true, confidence: 0.8, reason: 'Name matched.' };
    }
  }

  console.log(\`[verifyNameMatch] NO MATCH: "\${applicantNameTrimmed}" vs "\${extractedTextTrimmed}"\`);
  return {
    isMatch: false,
    confidence: 0,
    reason: 'Name extracted from document does not match the provided applicant name.',
  };
};`;

// Replace
const newContent = content.substring(0, fnStart) + newFunction + content.substring(fnEnd);
fs.writeFileSync(filePath, newContent, 'utf-8');

console.log('SUCCESS: Updated verifyNameMatch to be STRICT');
