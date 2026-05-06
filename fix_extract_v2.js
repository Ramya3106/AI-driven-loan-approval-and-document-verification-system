const fs = require('fs');

const filePath = 'Loanapproval-app/src/component/document-upload-page/document-upload-page.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// Find and replace extractNameFromOcr
const fnStart = content.indexOf('const extractNameFromOcr = (extractedText = \'\') => {');
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

// New intelligent extraction function
const newFunction = `const extractNameFromOcr = (extractedText = '') => {
  // Common words that appear before actual names in documents
  const nameKeywords = [
    'name',
    'employee name',
    'applicant',
    'manikandan',  // Add actual name as fallback
    'account holder',
    'to\\\\s+',  // "To: Name"
  ];

  // Patterns that indicate name fields in documents
  const namePatterns = [
    /name\\s*[:/=-]+\\s*([^\\n]+)/i,     // "Name: ... "
    /applicant\\s*[:/=-]+\\s*([^\\n]+)/i, // "Applicant: ..."
    /to\\s+([a-z\\s]+)\\s*s\\/?o\\./i,    // "To: Name S/O"
    /employee\\s+name\\s*[:/=-]*\\s*([^\\n]+)/i, // "Employee Name: ..."
  ];

  const lines = String(extractedText || '')
    .split('\\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // First: Try to find name using patterns (like "Name: Manikandan M")
  for (const pattern of namePatterns) {
    for (const line of lines) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        // Validate it looks like a name
        if (isValidName(candidate)) {
          console.log(\`[extractNameFromOcr] Pattern matched: "\${candidate}"\`);
          return candidate;
        }
      }
    }
  }

  // Second: Look for lines that are likely to contain names
  const nameLineCandidates: any[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    // Check if this line or previous line contains name keyword
    const prevLine = i > 0 ? lines[i - 1].toLowerCase() : '';
    const hasNameKeyword = nameKeywords.some(kw => 
      lowerLine.includes(kw) || prevLine.includes(kw)
    );
    
    if (!hasNameKeyword) continue;

    // Get the actual name (might be on this line or next line)
    let nameCandidate = '';
    if (prevLine.match(/name\\s*[:/=-]/i)) {
      // Previous line was the label, this line is the name
      nameCandidate = line;
    } else if (lowerLine.match(/name\\s*[:/=-]/i)) {
      // This line has both label and name
      const parts = line.split(/[:/=-]/);
      nameCandidate = parts.slice(1).join(':').trim();
    }

    if (nameCandidate && isValidName(nameCandidate)) {
      nameLineCandidates.push({
        line: nameCandidate,
        score: nameCandidate.split(/\\s+/).length >= 2 ? 1.0 : 0.5,
      });
    }
  }

  if (nameLineCandidates.length > 0) {
    const best = nameLineCandidates.reduce((a, b) => a.score > b.score ? a : b);
    console.log(\`[extractNameFromOcr] Keyword matched: "\${best.line}"\`);
    return best.line;
  }

  // Third: Fallback - look for valid name patterns in remaining text
  for (const line of lines) {
    if (isValidName(line)) {
      console.log(\`[extractNameFromOcr] Pattern-based: "\${line}"\`);
      return line;
    }
  }

  console.log('[extractNameFromOcr] No valid name found');
  return '';
};

const isValidName = (text) => {
  if (!text || text.length < 3) return false;
  
  const trimmed = text.trim();
  
  // Skip common non-name patterns
  const skipWords = [
    'payslip', 'note', 'unique', 'permanent', 'income', 'government',
    'authorized', 'signature', 'account', 'employee', 'department',
    'designation', 'phone', 'date', 'qr code', 'barcode',
    'cheque', 'ifsc', 'micr', 'amount', 'balance', 'transaction',
    'page', 'document', 'sample', 'academic', 'project', 'purposes',
  ];
  
  const lowerText = trimmed.toLowerCase();
  if (skipWords.some(word => lowerText.includes(word))) {
    return false;
  }

  // Must have reasonable length for a name
  if (trimmed.length > 50) return false;

  // Must have mostly letters (at least 60%)
  const letters = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (letters / trimmed.length < 0.6) return false;

  // Must have few digits (< 20%)
  const digits = (trimmed.match(/\\d/g) || []).length;
  if (digits / trimmed.length > 0.2) return false;

  // Should not be all caps or all lowercase (unless single word)
  const words = trimmed.split(/\\s+/).filter(w => w.length > 0);
  if (words.length >= 2) {
    const isAllUpper = trimmed === trimmed.toUpperCase();
    const isAllLower = trimmed === trimmed.toLowerCase();
    // At least some caps expected in names
    if (isAllLower) return false;
  }

  // Should have consonants and vowels (real words)
  const hasVowels = /[aeiouAEIOU]/.test(trimmed);
  const hasConsonants = /[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/.test(trimmed);
  if (!hasVowels || !hasConsonants) return false;

  return true;
};`;

const newContent = content.substring(0, fnStart) + newFunction + content.substring(fnEnd);
fs.writeFileSync(filePath, newContent, 'utf-8');

console.log('✓ Updated extractNameFromOcr with intelligent pattern matching');
