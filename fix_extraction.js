const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'Loanapproval-app', 'src', 'component', 'document-upload-page', 'document-upload-page.tsx');

let content = fs.readFileSync(filePath, 'utf-8');

const newExtractNameFromOcr = `const extractNameFromOcr = (extractedText = '') => {
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
    /^chennaima/i,
    /^tamil nadu/i,
    /^thiruvallur/i,
  ];

  const lines = String(extractedText || '')
    .split('\\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const candidates: any[] = [];
  
  for (const line of lines) {
    if (line.length < 3) continue;
    
    if (skipPatterns.some(pattern => pattern.test(line))) {
      continue;
    }

    const digitCount = (line.match(/\\d/g) || []).length;
    if (digitCount / line.length > 0.4) {
      continue;
    }

    const specialCount = (line.match(/[^a-zA-Z0-9\\s]/g) || []).length;
    if (specialCount / line.length > 0.25) {
      continue;
    }

    const letters = (line.match(/[a-zA-Z]/g) || []).length;
    if (letters / line.length < 0.5) {
      continue;
    }

    const words = line.split(/\\s+/).filter(w => w.length > 0);
    
    if (words.length >= 2 && words.length <= 4) {
      const allSingleLetters = words.every(w => w.length === 1);
      if (!allSingleLetters) {
        candidates.push({ line, wordCount: words.length, score: 1.0 });
      }
    }
    else if (words.length === 1 && line.length >= 4 && line.length <= 25) {
      candidates.push({ line, wordCount: 1, score: 0.7 });
    }
  }

  const multiWord = candidates.filter(c => c.wordCount >= 2);
  if (multiWord.length > 0) {
    console.log(\`[extractNameFromOcr] Found: "\${multiWord[0].line}"\`);
    return multiWord[0].line;
  }
  
  if (candidates.length > 0) {
    console.log(\`[extractNameFromOcr] Found: "\${candidates[0].line}"\`);
    return candidates[0].line;
  }
  
  return '';
};`;

// Find and replace the old function
const startIdx = content.indexOf('const extractNameFromOcr = (extractedText = \\'\\') => {');
if (startIdx === -1) {
  console.error('ERROR: Could not find extractNameFromOcr');
  process.exit(1);
}

let braceCount = 0;
let foundStart = false;
let endIdx = startIdx;

for (let i = startIdx; i < content.length; i++) {
  if (content[i] === '{') {
    braceCount++;
    foundStart = true;
  } else if (content[i] === '}') {
    braceCount--;
    if (foundStart && braceCount === 0) {
      endIdx = i + 1;
      break;
    }
  }
}

const newContent = content.substring(0, startIdx) + newExtractNameFromOcr + content.substring(endIdx);

fs.writeFileSync(filePath, newContent, 'utf-8');

console.log('✓ Successfully updated extractNameFromOcr function');
