#!/usr/bin/env python3
import re

# Read the file
filepath = r"c:\Users\divya\OneDrive\Desktop\AI driven loan approval and document verification system\Loanapproval-app\src\component\document-upload-page\document-upload-page.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# New extractNameFromOcr function
new_extract_name = '''const extractNameFromOcr = (extractedText = '') => {
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
    console.log(`[extractNameFromOcr] Found: "${multiWord[0].line}"`);
    return multiWord[0].line;
  }
  
  if (candidates.length > 0) {
    console.log(`[extractNameFromOcr] Found: "${candidates[0].line}"`);
    return candidates[0].line;
  }
  
  return '';
};'''

# Pattern to find the old extractNameFromOcr function
pattern = r'const extractNameFromOcr = \(extractedText = \'\'\) => \{[^}]*?(?:return \'\';\s*\};)'

# Use re.DOTALL to match across multiple lines
# Try a more precise approach: find from "const extractNameFromOcr" to the matching closing brace
start_idx = content.find('const extractNameFromOcr = (extractedText = \'\') => {')
if start_idx == -1:
    print("ERROR: Could not find extractNameFromOcr function")
    exit(1)

# Find the matching closing brace
brace_count = 0
in_function = False
end_idx = start_idx

for i in range(start_idx, len(content)):
    if content[i] == '{':
        brace_count += 1
        in_function = True
    elif content[i] == '}':
        brace_count -= 1
        if in_function and brace_count == 0:
            end_idx = i + 1
            break

if end_idx == start_idx:
    print("ERROR: Could not find matching closing brace")
    exit(1)

# Replace the function
new_content = content[:start_idx] + new_extract_name + content[end_idx:]

# Write back
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"SUCCESS: Updated extractNameFromOcr function in {filepath}")
