# OCR Validation Rules - Quick Reference Card

## Document-by-Document Validation Rules

### AADHAAR CARD
```
✓ ORIGINAL IF:
  • Name extracted from card matches application form name
  • AI validation passes (no tampering detected)

✕ TAMPERED IF:
  • Name does not match
  • AI detects tampering signals (watermarks, layout issues)

Example:
  Form Name: "Manikandan M"
  Extracted: "Manikandan M" → ✓ ORIGINAL
  Extracted: "Thiruvalur Thiruvalur" → ✕ TAMPERED
```

---

### PAN CARD
```
✓ ORIGINAL IF:
  • Name extracted from card matches application form name
  • AI validation passes (no tampering detected)

✕ TAMPERED IF:
  • Name does not match
  • AI detects tampering signals

Example:
  Form Name: "Manikandan M"
  Extracted: "MANIKANDAN M" → ✓ ORIGINAL (case-insensitive)
  Extracted: "John Smith" → ✕ TAMPERED
```

---

### SALARY SLIP ⚠️ MOST CRITICAL
```
✓ ORIGINAL IF AND ONLY IF BOTH:
  1. Name extracted matches application form name AND
  2. Annual income extracted matches application annual income

✕ TAMPERED IF EITHER:
  • Name does not match application form name
  • Annual income does not match application annual income
  • Insufficient readable content

⚠️ BOTH CHECKS ARE MANDATORY FOR SALARY SLIP

Example 1 (Success):
  Form: Name="Manikandan M", Annual Income="600000"
  Extracted: "Manikandan M", "600000"
  → ✓ ORIGINAL

Example 2 (Name Mismatch):
  Form: Name="Manikandan M", Annual Income="600000"
  Extracted: "John Smith", "600000"
  → ✕ TAMPERED (name mismatch)

Example 3 (Income Mismatch):
  Form: Name="Manikandan M", Annual Income="600000"
  Extracted: "Manikandan M", "800000"
  → ✕ TAMPERED (income mismatch)

Example 4 (Both Mismatch):
  Form: Name="Manikandan M", Annual Income="600000"
  Extracted: "John Smith", "800000"
  → ✕ TAMPERED (both mismatches)
```

---

### BANK STATEMENT
```
✓ ORIGINAL IF:
  • Name extracted matches application form name
  • Content appears legitimate (not a watermarked sample)

✕ TAMPERED IF:
  • Name does not match
  • Document shows "Sample Copy" or watermarks
  • AI detects tampering

Example:
  Form Name: "Manikandan M"
  Extracted: "Manikandan M" → ✓ ORIGINAL
  Extracted: "Unique Identification Author" → ✕ TAMPERED
```

---

### ID PROOF
```
✓ ORIGINAL IF:
  • Name extracted matches application form name
  • Document passes AI validation

✕ TAMPERED IF:
  • Name does not match
  • Extracted text is garbled (e.g., "a 0")
  • AI detects tampering

Example:
  Form Name: "Manikandan M"
  Extracted: "Manikandan M" → ✓ ORIGINAL
  Extracted: "a 0" → ✕ TAMPERED (garbled/unreadable)
```

---

### ADDRESS PROOF
```
✓ ORIGINAL IF:
  • Name extracted matches application form name
  • Document passes AI validation

✕ TAMPERED IF:
  • Name does not match
  • AI detects tampering

Note: Can relax name check slightly for bank statements
      but should still match overall applicant profile
```

---

## Name Matching Rules (3-Point Strategy)

```
A name MATCHES if ANY ONE of these is true:

1. DIRECT SUBSTRING MATCH (case-insensitive)
   Form: "Manikandan M"
   Extracted: "Manikandan M" ✓
   Extracted: "Manikandan Mohamed" ✓ (contains "Manikandan M")
   Extracted: "M. Manikandan" ✓
   Extracted: "MANIKANDAN M" ✓ (case difference OK)

2. COMPACT MATCH (remove all special characters)
   Form: "Manikandan M" → Compact: "manikandanm"
   Extracted: "Manikandan-M" → Compact: "manikandanm" ✓
   Extracted: "MANIKANDAN M" → Compact: "manikandanm" ✓

3. TOKEN MATCH (80%+ word coverage required)
   Form: "Manikandan M" → Tokens: ["manikandan", "m"]
   Extracted: "Manikandan Mohamed" → Tokens: ["manikandan", "mohamed"]
   Match: 1 out of 2 = 50% → ✗ FAILS (need 80%)
   
   Extracted: "Manikandan Mukundan" → Tokens: ["manikandan", "mukundan"]
   Match: 1 out of 2 = 50% → ✗ FAILS (need 80%)
   
   Extracted: "Manikandan" → Tokens: ["manikandan"]
   Match: 1 out of 1 = 100% → ✓ PASSES

⚠️ STRICT: Requires 80% token coverage (not 50%)
```

---

## Income Matching Rules (For Salary Slips)

```
Annual income MATCHES if extracted value equals or converts to:
Expected Annual Income ± 15% (tolerance)

EXAMPLE: Expected = 600,000

Tolerance Range: 600,000 ± 90,000 = 510,000 to 690,000

MATCHING STRATEGIES:

1. DIRECT MATCH
   Extracted: 600,000 ✓ (exact)
   Extracted: 600,100 ✓ (within tolerance)
   Extracted: 500,000 ✗ (outside tolerance)

2. MONTHLY-TO-ANNUAL CONVERSION
   Extracted: 50,000 (monthly)
   Calculation: 50,000 × 12 = 600,000 ✓
   Extracted: 40,000 (monthly)
   Calculation: 40,000 × 12 = 480,000 ✗ (outside tolerance)

3. SCALE/ZERO ISSUES (OCR errors)
   Expected: 600,000
   Extracted: 600 (missing zeros)
   Calculation: 600 × 1,000 = 600,000 ✓
   
   Extracted: 6000 (one zero missing)
   Calculation: 6000 × 100 = 600,000 ✓

4. REVERSE CONVERSIONS
   Extracted: 1,200 (might be annual in thousands)
   Calculation: 1,200 × 1,000 = 1,200,000 ✗ (too high)

⚠️ STRICT: Requires exact match or valid conversion
           Tolerance is 15% maximum
```

---

## Cross-Document Consistency Rules

```
When Multiple Documents Are Uploaded:

ALL extracted names must match the application form name

✓ CONSISTENT if:
  • Aadhaar: "Manikandan M" = Form: "Manikandan M"
  • PAN: "Manikandan M" = Form: "Manikandan M"
  • Salary Slip: "Manikandan M" = Form: "Manikandan M"

✗ INCONSISTENT if:
  • Aadhaar: "Manikandan M" ✓
  • PAN: "John Smith" ✗ (different name)
  • Salary Slip: "M. Manikandan" ✓ (OK - same person)
```

---

## Error Messages & What They Mean

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "Name in this document does not match the application form or other uploaded documents." | Extracted name ≠ form name | Verify document name field is correct, re-upload if OCR failed |
| "Annual income extracted from salary slip does not match provided details." | Income mismatch on salary slip | Check salary slip has correct annual income, may need higher resolution image |
| "Unable to read name from document. Please upload a clearer image." | OCR couldn't extract readable text | Upload higher resolution, well-lit image of document |
| "Name extracted from document does not match the provided applicant name." | Single document name mismatch | Check document is for correct person |
| "Font/layout irregularity detected by text pattern check." | AI detected potential tampering | Document may be tampered or of poor quality |
| "Possible watermark inconsistency detected in OCR text." | Watermark text detected | Document may be sample/demo version |

---

## Display Rules

### What to Show User

**When Status = ORIGINAL:**
```
✓ ORIGINAL
(Green checkmark, green text)
(Document passed all validation checks)
```

**When Status = TAMPERED:**
```
✕ [SPECIFIC ERROR MESSAGE]
(Red X mark, red text)
(Shows which validation criterion failed)

Examples:
✕ Name in this document does not match the application form
✕ Annual income extracted from salary slip does not match provided details
✕ Unable to read name from document. Please upload a clearer image.
```

---

## Validation Checklist

### For Each Document Upload

- [ ] Is OCR text extracted successfully?
  - Check: Console log shows extracted text length > 30
  
- [ ] Is name extracted correctly?
  - Check: Console shows `[extractNameFromDocumentOcr] Found: "Name"`
  - Verify: Extracted name is visible to user
  
- [ ] Does name match application form?
  - Check: Console shows `[clientNameMatch] ✓` or `✗`
  - For Salary Slip: Must match

- [ ] For Salary Slip: Is income extracted?
  - Check: Console shows income matching logs
  - Verify: Income visible in document
  
- [ ] For Salary Slip: Does income match form?
  - Check: Console shows `[clientIncomeMatch] ✓` or `✗`
  - Verify: Within 15% tolerance

- [ ] Does document pass AI validation?
  - Check: No tampering signals, watermarks, or layout issues
  
- [ ] Is correct status displayed?
  - For Original: Green ✓
  - For Tampered: Red ✗ with specific message

---

## Key Differences from Previous System

| Aspect | Previous | NEW (Stricter) |
|--------|----------|---|
| Name Matching | 50% token threshold | 80% token threshold |
| Salary Slip | Name only | Name + Income (both required) |
| Income Tolerance | Varied | Fixed 15% tolerance |
| Monthly-to-Annual | Basic support | Full calculation support |
| Error Messages | Generic | Specific by document type |
| Cross-Document | Not enforced | All must be consistent |

---

## Testing the System

### Quick Test 1: Aadhaar Card
```
Input:
  Form Name: "Manikandan M"
  Uploaded: Aadhaar card image containing "Manikandan M"

Expected Output:
  Console: [extractNameFromDocumentOcr] Found: "Manikandan M"
  Display: ✓ Original (green)
```

### Quick Test 2: Salary Slip - Both Pass
```
Input:
  Form Name: "Manikandan M"
  Form Annual Income: "600000"
  Uploaded: Salary slip with name and 600000

Expected Output:
  Console: [clientNameMatch] ✓ Direct match
  Console: [clientIncomeMatch] ✓ Direct match
  Display: ✓ Original (green)
```

### Quick Test 3: Salary Slip - Income Fails
```
Input:
  Form Name: "Manikandan M"
  Form Annual Income: "600000"
  Uploaded: Salary slip with "Manikandan M" and "800000"

Expected Output:
  Console: [clientNameMatch] ✓ Direct match
  Console: [clientIncomeMatch] ✗ No income match
  Display: ✕ Annual income extracted from salary slip... (red)
```

---

**Remember**: 
- ✓ ORIGINAL = All validation checks PASSED
- ✕ TAMPERED = Any validation check FAILED
- Salary Slip REQUIRES BOTH name AND income match
