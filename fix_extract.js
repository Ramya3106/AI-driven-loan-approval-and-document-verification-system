const fs = require('fs');

const filePath = 'Loanapproval-app/src/component/document-upload-page/document-upload-page.tsx';

// Read file
let content = fs.readFileSync(filePath, 'utf-8');

// Find the extractNameFromOcr function start
const fnStart = content.indexOf('const extractNameFromOcr = (extractedText = \'\') => {');
if (fnStart === -1) {
  console.error('Function not found');
  process.exit(1);
}

// Find matching closing brace
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

console.log('Found function from', fnStart, 'to', fnEnd);
console.log('Original function length:', fnEnd - fnStart);

// New function to insert
const newFunction = `const extractNameFromOcr = (extractedText = '') => {
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
    /^s\\/o\\./i,
    /^to\\s/i,
    /^from/i,
  ];

  const lines = String(extractedText || '')
    .split('\\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const candidates: any[] = [];
  
  for (const line of lines) {
    if (line.length < 3) continue;
    if (skipPatterns.some(pattern => pattern.test(line))) continue;

    const digitCount = (line.match(/\\d/g) || []).length;
    if (digitCount / line.length > 0.4) continue;

    const specialCount = (line.match(/[^a-zA-Z0-9\\s]/g) || []).length;
    if (specialCount / line.length > 0.25) continue;

    const letters = (line.match(/[a-zA-Z]/g) || []).length;
    if (letters / line.length < 0.5) continue;

    const words = line.split(/\\s+/).filter(w => w.length > 0);
    
    if (words.length >= 2 && words.length <= 4) {
      const allSingleLetters = words.every(w => w.length === 1);
      if (!allSingleLetters) {
        candidates.push({ line, wordCount: words.length });
      }
    }
    else if (words.length === 1 && line.length >= 4 && line.length <= 25) {
      candidates.push({ line, wordCount: 1 });
    }
  }

  const multiWord = candidates.filter(c => c.wordCount >= 2);
  return (multiWord.length > 0) ? multiWord[0].line : (candidates.length > 0 ? candidates[0].line : '');
};`;

// Replace
const newContent = content.substring(0, fnStart) + newFunction + content.substring(fnEnd);

// Write back
fs.writeFileSync(filePath, newContent, 'utf-8');

console.log('SUCCESS: Updated extractNameFromOcr');
