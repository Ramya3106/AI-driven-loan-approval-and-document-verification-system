# OCR Validation System - Testing Checklist

## Pre-Testing Setup

- [ ] Server is running on port 5000
- [ ] MongoDB is connected
- [ ] OCR API key is configured (OCR.space or Tesseract)
- [ ] Frontend app is running
- [ ] Browser console is open (F12)
- [ ] Ready to test with actual document images

---

## Test Suite 1: Name Extraction

### Test 1.1: Extract Name from Aadhaar
```
Document: Aadhaar card with "Manikandan M"
Expected Console Log:
  [extractNameFromDocumentOcr] Pattern matched: "Manikandan M"
✓ PASS: Name extracted correctly
✗ FAIL: Check if Aadhaar text is being read
```

### Test 1.2: Extract Name from PAN (Uppercase)
```
Document: PAN card with "MANIKANDAN M"
Expected Console Log:
  [extractNameFromDocumentOcr] Pattern matched: "MANIKANDAN M"
✓ PASS: Uppercase name extracted
✗ FAIL: Check OCR output for PAN card
```

### Test 1.3: Extract Name from Salary Slip
```
Document: Salary slip with "Manikandan M" as employee name
Expected Console Log:
  [extractNameFromDocumentOcr] Found: "Manikandan M"
✓ PASS: Salary slip name extracted despite "Payslip" header
✗ FAIL: Check if header text is being returned instead
```

### Test 1.4: Skip Non-Name Content
```
Document: Bank statement header "ABC Bank Limited"
Expected:
  Should NOT extract "ABC Bank Limited" as the name
  Should find actual account holder name
✓ PASS: Header skipped, correct name extracted
✗ FAIL: Check skip patterns in extractNameFromDocumentOcr
```

### Test 1.5: Handle Unreadable Documents
```
Document: Blurry or low-quality image
Expected Console Log:
  [extractNameFromDocumentOcr] No valid name found
✓ PASS: No false name extraction
✗ FAIL: May need better skip logic
```

---

## Test Suite 2: Name Matching

### Test 2.1: Direct Match (Case-Insensitive)
```
Form Name: "Manikandan M"
Extracted: "Manikandan M"
Expected Console Log:
  [clientNameMatch] ✓ Direct match: "Manikandan M" in extracted text
Display: ✓ Original
✓ PASS: Direct match works
✗ FAIL: Check clientNameMatch logic
```

### Test 2.2: Uppercase Match
```
Form Name: "Manikandan M"
Extracted: "MANIKANDAN M"
Expected Console Log:
  [clientNameMatch] ✓ Direct match (case-insensitive)
Display: ✓ Original
✓ PASS: Case-insensitive matching works
✗ FAIL: Check toLowerCase() implementation
```

### Test 2.3: Compact Match (Special Chars)
```
Form Name: "Manikandan M"
Extracted: "Manikandan - M"
Expected Console Log:
  [clientNameMatch] ✓ Compact match
Display: ✓ Original
✓ PASS: Special characters ignored
✗ FAIL: Check normalizeText function
```

### Test 2.4: Token Match (80% threshold)
```
Form Name: "Manikandan Mukesh"
Extracted: "Manikandan M"
Tokens: ["manikandan", "mukesh"] vs ["manikandan", "m"]
Match: 1/2 = 50% → ✗ BELOW 80% threshold
Expected: ✕ Tampered
✓ PASS: Strict 80% threshold enforced
✗ FAIL: Check token matching logic is strict enough
```

### Test 2.5: Token Match - Full Coverage
```
Form Name: "Manikandan"
Extracted: "Manikandan Mukesh"
Tokens: ["manikandan"] vs ["manikandan", "mukesh"]
Match: 1/1 = 100% → ✓ ABOVE 80% threshold
Expected: ✓ Original
✓ PASS: Token matching works with full coverage
✗ FAIL: Check token matching threshold
```

### Test 2.6: Name Mismatch
```
Form Name: "Manikandan M"
Extracted: "John Smith"
Expected Console Log:
  [clientNameMatch] ✗ No match for "Manikandan M"
Display: ✕ Name in this document does not match...
✓ PASS: Mismatch correctly detected
✗ FAIL: Check name comparison logic
```

---

## Test Suite 3: Income Matching (Salary Slip)

### Test 3.1: Direct Income Match
```
Form Annual Income: 600000
Extracted from Salary Slip: "600000"
Expected Console Log:
  [clientIncomeMatch] ✓ Direct match: 600000 ≈ 600000
✓ PASS: Direct match works
✗ FAIL: Check numeric extraction
```

### Test 3.2: Monthly-to-Annual Conversion
```
Form Annual Income: 600000
Extracted from Salary Slip: "50000" (monthly)
Expected Console Log:
  [clientIncomeMatch] ✓ Monthly match: 50000*12 = 600000 ≈ 600000
✓ PASS: Monthly conversion works
✗ FAIL: Check monthly-to-annual calculation
```

### Test 3.3: Income Within Tolerance
```
Form Annual Income: 600000
Extracted: 610000 (within 15% tolerance of ~90000)
Expected Console Log:
  [clientIncomeMatch] ✓ Direct match: 610000 ≈ 600000
Display: ✓ Original
✓ PASS: Tolerance range works
✗ FAIL: Check tolerance calculation
```

### Test 3.4: Income Outside Tolerance
```
Form Annual Income: 600000
Extracted: 800000 (outside 15% tolerance)
Expected Console Log:
  [clientIncomeMatch] ✗ No income match for expected=600000
Display: ✕ Annual income extracted from salary slip...
✓ PASS: Out-of-tolerance detected
✗ FAIL: Check tolerance threshold
```

### Test 3.5: Missing Income
```
Form Annual Income: 600000
Extracted from Salary Slip: No numeric values found
Expected Console Log:
  [clientIncomeMatch] ✗ No numbers found in extracted text
Display: ✕ Annual income extracted from salary slip...
✓ PASS: Missing income detected
✗ FAIL: Check numeric extraction
```

### Test 3.6: Scale Issue (OCR Dropped Zero)
```
Form Annual Income: 600000
Extracted: "600" (zero dropped by OCR)
Expected Console Log:
  [clientIncomeMatch] ✓ Thousands match: 600*1000 = 600000 ≈ 600000
Display: ✓ Original
✓ PASS: Scale issue handled
✗ FAIL: Check thousand multiplier logic
```

---

## Test Suite 4: Salary Slip Validation (Complete)

### Test 4.1: Salary Slip - Both Pass
```
Form: Name="Manikandan M", Annual Income=600000
Extracted: "Manikandan M" and "600000"
Expected:
  - Name match: ✓
  - Income match: ✓
  - Display: ✓ Original (green)
✓ PASS: Salary slip passes with both matches
✗ FAIL: Check salary slip validation logic
```

### Test 4.2: Salary Slip - Name Fails
```
Form: Name="Manikandan M", Annual Income=600000
Extracted: "John Smith" and "600000"
Expected:
  - Name match: ✗
  - Income match: ✓
  - Display: ✕ Name in this document does not match... (red)
✓ PASS: Correctly fails salary slip when name mismatches
✗ FAIL: Check salary slip logic requires BOTH
```

### Test 4.3: Salary Slip - Income Fails
```
Form: Name="Manikandan M", Annual Income=600000
Extracted: "Manikandan M" and "800000"
Expected:
  - Name match: ✓
  - Income match: ✗
  - Display: ✕ Annual income extracted from salary slip... (red)
✓ PASS: Correctly fails salary slip when income mismatches
✗ FAIL: Check salary slip income requirement
```

### Test 4.4: Salary Slip - Both Fail
```
Form: Name="Manikandan M", Annual Income=600000
Extracted: "John Smith" and "800000"
Expected:
  - Name match: ✗
  - Income match: ✗
  - Display: ✕ Error message (red)
✓ PASS: Correctly fails when both fail
✗ FAIL: Check error message handling
```

---

## Test Suite 5: Other Documents

### Test 5.1: Aadhaar Card - Match
```
Form Name: "Manikandan M"
Document: Aadhaar with "Manikandan M"
Expected Display: ✓ Original
✓ PASS: Aadhaar validates with name match
✗ FAIL: Check Aadhaar validation
```

### Test 5.2: Aadhaar Card - Mismatch
```
Form Name: "Manikandan M"
Document: Aadhaar with "John Smith"
Expected Display: ✕ Name in this document does not match...
✓ PASS: Aadhaar rejects name mismatch
✗ FAIL: Check Aadhaar validation
```

### Test 5.3: PAN Card - Match
```
Form Name: "Manikandan M"
Document: PAN with "MANIKANDAN M"
Expected Display: ✓ Original
✓ PASS: PAN validates with case-insensitive match
✗ FAIL: Check PAN validation
```

### Test 5.4: Bank Statement - Match
```
Form Name: "Manikandan M"
Document: Bank with "Manikandan M" (not header)
Expected Display: ✓ Original
✓ PASS: Bank statement validates
✗ FAIL: Check bank statement validation
```

### Test 5.5: ID Proof - Garbled Text
```
Form Name: "Manikandan M"
Document: ID with unreadable text "a 0"
Expected:
  - Name extraction fails
  - Display: ✕ Unable to read name...
✓ PASS: Garbled text rejected
✗ FAIL: Check text quality validation
```

---

## Test Suite 6: Cross-Document Consistency

### Test 6.1: All Documents Match
```
Upload 3 documents:
  - Aadhaar: "Manikandan M"
  - PAN: "MANIKANDAN M"
  - Salary Slip: "Manikandan M" (with correct income)

Expected:
  - All show: ✓ Original
  - No conflicts between documents
✓ PASS: Cross-document consistency verified
✗ FAIL: Check document comparison logic
```

### Test 6.2: Documents Conflict
```
Upload 2 documents:
  - Aadhaar: "Manikandan M"
  - Salary Slip: "John Smith" (name extracted wrong)

Expected:
  - Aadhaar: ✓ Original
  - Salary Slip: ✕ Name does not match...
✓ PASS: Conflict detected
✗ FAIL: Check cross-document validation
```

---

## Test Suite 7: Database Storage

### Test 7.1: Verified Document Stored
```
Upload: Aadhaar card, gets status="verified"
Check MongoDB:
  - Document stored in 'documents' collection
  - status field = "verified"
  - statusText field = "Original"
✓ PASS: Data stored correctly
✗ FAIL: Check MongoDB insert
```

### Test 7.2: Tampered Document Stored
```
Upload: Aadhaar with wrong name, gets status="tampered"
Check MongoDB:
  - Document stored in 'documents' collection
  - status field = "tampered"
  - statusText contains error message
✓ PASS: Error stored correctly
✗ FAIL: Check error storage
```

---

## Test Suite 8: UI/UX Feedback

### Test 8.1: Upload Progress Animation
```
Upload document:
  - Progress bar appears (0-100%)
  - "Uploading document..." message
  - "Running OCR and AI checks..." message
✓ PASS: User feedback shows progress
✗ FAIL: Check progress animations
```

### Test 8.2: Extracted Name Display
```
After upload:
  - Extracted name shown to user
  - User can verify name is correct
  - Helps identify extraction errors
✓ PASS: Name displayed for user confirmation
✗ FAIL: Check UI display logic
```

### Test 8.3: Status Icon and Color
```
Verified document:
  - Green checkmark ✓
  - Green text "Original"
  
Tampered document:
  - Red X mark ✕
  - Red text with error message
✓ PASS: Visual feedback is clear
✗ FAIL: Check style sheet
```

### Test 8.4: Progress Count
```
Sidebar shows:
  - "Verified documents: X/6"
  - Count increases as documents verify
✓ PASS: Count accurate
✗ FAIL: Check counting logic
```

---

## Test Suite 9: Edge Cases

### Test 9.1: Empty Extracted Text
```
OCR returns empty string
Expected:
  - Error: "Unable to read text from image"
  - Status: ✕ Tampered
✓ PASS: Empty text handled
✗ FAIL: Check empty text validation
```

### Test 9.2: Very Long Name
```
Form: "Manikandan Mukesh Mohamed Manikandan Mukesh" (>80 chars)
Expected:
  - System rejects as invalid name
  - Shows error
✓ PASS: Length validation works
✗ FAIL: Check length validation
```

### Test 9.3: Numbers Only
```
Extracted: "123456789"
Expected:
  - System rejects (no letters)
  - Shows error
✓ PASS: Letter requirement enforced
✗ FAIL: Check letter validation
```

### Test 9.4: Special Characters Only
```
Extracted: "!@#$%^&*()"
Expected:
  - System rejects
  - Shows error
✓ PASS: Special char validation works
✗ FAIL: Check special char handling
```

### Test 9.5: Whitespace Name
```
Extracted: "   " (spaces only)
Expected:
  - System rejects
  - Shows error
✓ PASS: Whitespace rejected
✗ FAIL: Check trim/empty validation
```

---

## Test Suite 10: Performance

### Test 10.1: OCR Speed
```
Upload document image
Expected:
  - OCR completes within 90 seconds (OCR_TIMEOUT_MS)
  - User sees progress feedback
✓ PASS: OCR completes in time
✗ FAIL: Check OCR endpoint or image size
```

### Test 10.2: Validation Speed
```
After OCR completes
Expected:
  - Validation completes within 10 seconds (VALIDATION_TIMEOUT_MS)
  - User sees "Original" or error within 10 seconds
✓ PASS: Validation completes quickly
✗ FAIL: Check validation endpoint
```

### Test 10.3: Large Image Handling
```
Upload: 5MB+ high-resolution image
Expected:
  - System handles gracefully
  - May downscale for processing
  - Still validates correctly
✓ PASS: Large images work
✗ FAIL: Check image manipulation
```

---

## Regression Tests

Run these after any code changes:

- [ ] Test 1.1: Name extraction still works
- [ ] Test 2.1: Direct name match works
- [ ] Test 3.1: Direct income match works
- [ ] Test 4.1: Salary slip dual validation works
- [ ] Test 5.1: Aadhaar validation works
- [ ] Test 6.1: Cross-document consistency works
- [ ] Test 7.1: Database storage works
- [ ] Test 8.3: UI feedback shows correctly
- [ ] Test 9.1: Edge cases handled
- [ ] Test 10.1: Performance acceptable

---

## Test Results Summary

| Test Suite | Total Tests | Passed | Failed | Notes |
|-----------|-----------|--------|--------|-------|
| 1: Name Extraction | 5 | _ | _ | |
| 2: Name Matching | 6 | _ | _ | |
| 3: Income Matching | 6 | _ | _ | |
| 4: Salary Slip | 4 | _ | _ | ⚠️ CRITICAL |
| 5: Other Documents | 5 | _ | _ | |
| 6: Cross-Document | 2 | _ | _ | |
| 7: Database | 2 | _ | _ | |
| 8: UI/UX | 4 | _ | _ | |
| 9: Edge Cases | 5 | _ | _ | |
| 10: Performance | 3 | _ | _ | |
| **TOTAL** | **42** | _ | _ | |

---

## Sign-Off

- Tester: ________________
- Date: ________________
- Overall Status: 
  - [ ] ALL PASS - Ready for Production
  - [ ] SOME FAIL - Needs Investigation
  - [ ] CRITICAL FAIL - Do Not Deploy

---

## Notes & Issues Found

```
1. ___________________________________________
   Status: [ ] Fixed [ ] Pending [ ] Not Critical

2. ___________________________________________
   Status: [ ] Fixed [ ] Pending [ ] Not Critical

3. ___________________________________________
   Status: [ ] Fixed [ ] Pending [ ] Not Critical
```

---

**Remember to test thoroughly before deployment!**
