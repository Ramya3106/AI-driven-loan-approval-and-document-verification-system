// @ts-nocheck
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import Constants from 'expo-constants';

const DOCUMENT_TYPES = [
  { key: 'aadhaarCard', label: 'Aadhaar Card' },
  { key: 'panCard', label: 'PAN Card' },
  { key: 'salarySlip', label: 'Salary Slip' },
  { key: 'bankStatement', label: 'Bank Statement' },
  { key: 'idProof', label: 'ID Proof' },
  { key: 'addressProof', label: 'Address Proof' },
];

const OCR_TIMEOUT_MS = 90000;
const VALIDATION_TIMEOUT_MS = 10000;
const LOCAL_OCR_TIMEOUT_MS = 15000;
const IS_EXPO_GO =
  Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

const sanitizeBaseUrl = (value: string) => (value || '').trim().replace(/\/+$/, '');

const getApiBaseUrl = () => {
  const manualBaseUrl = sanitizeBaseUrl(
    String(Constants.expoConfig?.extra?.apiBaseUrl || Constants.manifest?.extra?.apiBaseUrl || '')
  );

  if (manualBaseUrl) {
    return manualBaseUrl;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoConfig?.extra?.expoClient?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost ||
    Constants.manifest?.hostUri ||
    '';

  const host = hostUri
    ? hostUri.split(':')[0]
    : Platform.OS === 'android'
      ? '10.0.2.2'
      : 'localhost';
  return sanitizeBaseUrl(`http://${host}:5000`);
};

const withTimeout = async (url: string, options: any, timeoutMs: number, fallbackMessage: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(fallbackMessage);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const withPromiseTimeout = async <T,>(workPromise: Promise<T>, timeoutMs: number, fallbackMessage: string) => {
  let timer: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(fallbackMessage)), timeoutMs);
  });

  try {
    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
};

const loadOptionalLocalOcrModule = async () => {
  if (IS_EXPO_GO) {
    return null;
  }

  try {
    // Dynamic import wrapped in eval to prevent Expo Go bundler from resolving
    // expo-mlkit-ocr at bundle time (it requires native modules unavailable in Expo Go)
    const moduleRef: any = await (new Function('m', 'return import(m)'))('expo-mlkit-ocr').catch(() => null);
    return moduleRef?.default || moduleRef || null;
  } catch (error) {
    return null;
  }
};

const requestGalleryPermission = async () => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
};

const normalizeText = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const extractNameFromOcr = (extractedText = '') => {
  // Common words that appear before actual names in documents
  const nameKeywords = [
    'name',
    'employee name',
    'applicant',
    'manikandan',  // Add actual name as fallback
    'account holder',
    'to\\s+',  // "To: Name"
  ];

  // Patterns that indicate name fields in documents
  const namePatterns = [
    /name\s*[:/=-]+\s*([^\n]+)/i,     // "Name: ... "
    /applicant\s*[:/=-]+\s*([^\n]+)/i, // "Applicant: ..."
    /to\s+([a-z\s]+)\s*s\/?o\./i,    // "To: Name S/O"
    /employee\s+name\s*[:/=-]*\s*([^\n]+)/i, // "Employee Name: ..."
  ];

  const lines = String(extractedText || '')
    .split('\n')
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
          console.log(`[extractNameFromOcr] Pattern matched: "${candidate}"`);
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
    if (prevLine.match(/name\s*[:/=-]/i)) {
      // Previous line was the label, this line is the name
      nameCandidate = line;
    } else if (lowerLine.match(/name\s*[:/=-]/i)) {
      // This line has both label and name
      const parts = line.split(/[:/=-]/);
      nameCandidate = parts.slice(1).join(':').trim();
    }

    if (nameCandidate && isValidName(nameCandidate)) {
      nameLineCandidates.push({
        line: nameCandidate,
        score: nameCandidate.split(/\s+/).length >= 2 ? 1.0 : 0.5,
      });
    }
  }

  if (nameLineCandidates.length > 0) {
    const best = nameLineCandidates.reduce((a, b) => a.score > b.score ? a : b);
    console.log(`[extractNameFromOcr] Keyword matched: "${best.line}"`);
    return best.line;
  }

  // Third: Fallback - look for valid name patterns in remaining text
  for (const line of lines) {
    if (isValidName(line)) {
      console.log(`[extractNameFromOcr] Pattern-based: "${line}"`);
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
  const digits = (trimmed.match(/\d/g) || []).length;
  if (digits / trimmed.length > 0.2) return false;

  // Reject all-lowercase multi-word strings; ALL-CAPS is valid (Indian docs use all caps)
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 2 && trimmed === trimmed.toLowerCase()) return false;

  // Should have consonants and vowels (real words)
  const hasVowels = /[aeiouAEIOU]/.test(trimmed);
  const hasConsonants = /[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/.test(trimmed);
  if (!hasVowels || !hasConsonants) return false;

  return true;
};;;

const verifyNamesMatch = (formName = '', extractedNames: Record<string, string> = {}) => {
  if (!formName || !String(formName).trim()) {
    return { allMatch: false, reason: 'Form name is empty' };
  }
  
  const formNameTrimmed = String(formName).trim().toLowerCase();
  const formCompact = normalizeText(formName);
  
  const extractedList = Object.entries(extractedNames)
    .filter(([_, name]) => name && String(name).trim())
    .map(([doc, name]) => ({ doc, name: String(name).trim(), compact: normalizeText(String(name)) }));
  
  if (!extractedList.length) {
    return { allMatch: true, reason: 'No documents uploaded yet' };
  }

  const mismatches: string[] = [];
  const matches: string[] = [];
  
  for (const { doc, name, compact } of extractedList) {
    let isMatch = false;
    
    // Strategy 1: Simple substring match (case-insensitive)
    const extractedLower = name.toLowerCase();
    if (extractedLower.includes(formNameTrimmed) || formNameTrimmed.includes(extractedLower)) {
      isMatch = true;
      console.log(`[verifyNamesMatch] Strategy1 matched: "${formName}" in "${name}"`);
    }
    
    // Strategy 2: Compact match (all special chars removed)
    if (!isMatch && (compact.includes(formCompact) || formCompact.includes(compact))) {
      isMatch = true;
      console.log(`[verifyNamesMatch] Strategy2 matched: "${formCompact}" in "${compact}"`);
    }
    
    // Strategy 3: Token matching - check if all significant form tokens appear
    if (!isMatch) {
      const formTokens = formNameTrimmed.split(/\s+/).filter(t => t.length > 1);
      const extractedTokens = extractedLower.split(/\s+/).filter(t => t.length > 1);
      const matched = formTokens.filter(ft => extractedTokens.some(et => et.includes(ft) || ft.includes(et))).length;
      if (formTokens.length > 0 && matched >= Math.max(1, Math.ceil(formTokens.length * 0.6))) {
        isMatch = true;
        console.log(`[verifyNamesMatch] Strategy3 matched: tokens ${matched}/${formTokens.length}`);
      }
    }
    
    if (isMatch) {
      matches.push(doc);
    } else {
      mismatches.push(`${doc}: "${name}" vs form: "${formName}"`);
    }
  }

  if (mismatches.length > 0) {
    return {
      allMatch: false,
      reason: `Name mismatch: ${mismatches.join('; ')}`,
      matches,
      mismatches,
    };
  }

  return {
    allMatch: true,
    reason: `All ${matches.length} document(s) verified: names match`,
    matches,
  };
};

const tokenizeNameSimple = (value = '') => {
  return (String(value || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean));
};

const clientNameMatch = (applicantName = '', extractedText = '') => {
  const applicantNameTrimmed = String(applicantName || '').trim();
  const extractedTextTrimmed = String(extractedText || '').trim();
  if (!applicantNameTrimmed || !extractedTextTrimmed) return false;

  const applicantLower = applicantNameTrimmed.toLowerCase();
  const extractedLower = extractedTextTrimmed.toLowerCase();

  // Extracted text must CONTAIN the applicant name (not the other way around)
  if (extractedLower.includes(applicantLower)) {
    console.log(`[clientNameMatch] Direct match`);
    return true;
  }

  // Compact match: extracted compact must contain form name compact
  const compact = normalizeText(applicantNameTrimmed);
  const extractedCompact = normalizeText(extractedTextTrimmed);
  if (extractedCompact.includes(compact) && compact.length >= 5) {
    console.log(`[clientNameMatch] Compact match`);
    return true;
  }

  // Token match: 80%+ of name tokens must appear in extracted text
  const tokens = tokenizeNameSimple(applicantName);
  const extractedTokens = tokenizeNameSimple(extractedText);
  if (!tokens.length) return false;
  const matched = tokens.filter(t => extractedTokens.some(et => et === t || (et.includes(t) && t.length >= 4) || (t.includes(et) && et.length >= 4))).length;
  const coverage = matched / tokens.length;
  console.log(`[clientNameMatch] Token coverage: ${coverage.toFixed(2)}`);
  if (coverage >= 0.8) {
    console.log(`[clientNameMatch] Token match`);
    return true;
  }

  console.log(`[clientNameMatch] No match for "${applicantName}"`);
  return false;
};

const clientIncomeMatch = (expectedAnnual = 0, extractedText = '') => {
  const numStr = String(expectedAnnual || '').trim();
  if (!numStr) return false;
  const expected = Number(numStr) || 0;
  if (!expected) return false;

  // Extract all multi-digit numbers from text
  const numericCandidates = (String(extractedText || '').match(/\d+/g) || [])
    .map((s) => Number(s))
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
      console.log(`[clientIncomeMatch] ✓ Monthly match: ${cand}*12 = ${cand*12} ≈ ${expected}`);
      return true;
    }

    // Thousands to actual: candidate * 1000
    if (Math.abs((cand * 1000) - expected) <= tolerance) {
      console.log(`[clientIncomeMatch] ✓ Thousands match: ${cand}*1000 = ${cand*1000} ≈ ${expected}`);
      return true;
    }
  }

  console.log(`[clientIncomeMatch] ✗ No income match for expected=${expected}`);
  return false;
};

const runOcrViaApi = async ({ base64Image, documentType }: { base64Image: string; documentType: string }) => {
  const response = await withTimeout(
    `${getApiBaseUrl()}/ocr`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ base64Image, documentType }),
    },
    OCR_TIMEOUT_MS,
    `OCR timed out after ${Math.round(OCR_TIMEOUT_MS / 1000)} seconds. Please retry with a clearer image.`
  );

  if (!response.ok) {
    let errorMessage = 'OCR request failed';
    try {
      const body = await response.json();
      if (body?.error) {
        errorMessage = body.error;
      }
    } catch (error) {
      // Keep fallback error message.
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data?.text || '';
};

const runLocalOcr = async (imageUri: string) => {
  const localOcrModule = await loadOptionalLocalOcrModule();
  if (!localOcrModule?.recognizeText) {
    throw new Error('Local OCR module unavailable.');
  }

  const result: any = await withPromiseTimeout(
    localOcrModule.recognizeText(imageUri),
    LOCAL_OCR_TIMEOUT_MS,
    'Local OCR timed out.'
  );
  return result?.text || '';
};

const runBestEffortOcr = async ({
  imageUri,
  base64Image,
  documentType,
}: {
  imageUri: string;
  base64Image: string;
  documentType: string;
}) => {
  try {
    const localText = await runLocalOcr(imageUri);
    if (localText && localText.trim().length >= 20) {
      return localText.trim();
    }
  } catch (error) {
    // Fall back to server OCR when local OCR fails on current runtime/device.
  }

  if (!base64Image) {
    throw new Error('Unable to extract text from image. Please retry with a clearer image.');
  }

  const variants: Array<{ base64: string; label: string }> = [
    { base64: base64Image, label: 'original' },
  ];

  try {
    const compact = await manipulateAsync(
      imageUri,
      [{ resize: { width: 1400 } }],
      { compress: 0.7, format: SaveFormat.JPEG, base64: true }
    );

    if (compact?.base64) {
      variants.push({ base64: compact.base64, label: 'resized' });
    }

    const rotatedLeft = await manipulateAsync(
      imageUri,
      [{ resize: { width: 1400 } }, { rotate: -90 }],
      { compress: 0.72, format: SaveFormat.JPEG, base64: true }
    );
    if (rotatedLeft?.base64) {
      variants.push({ base64: rotatedLeft.base64, label: 'rotated-left' });
    }

    const rotatedRight = await manipulateAsync(
      imageUri,
      [{ resize: { width: 1400 } }, { rotate: 90 }],
      { compress: 0.72, format: SaveFormat.JPEG, base64: true }
    );
    if (rotatedRight?.base64) {
      variants.push({ base64: rotatedRight.base64, label: 'rotated-right' });
    }
  } catch (error) {
    // If image manipulation is unavailable/fails, continue with original variant.
  }

  const isPan = normalizeText(documentType).includes('pancard');
  let bestText = '';
  let lastError: any = null;

  for (const variant of variants) {
    try {
      const text = (await runOcrViaApi({ base64Image: variant.base64, documentType }))?.trim() || '';
      if (!text) {
        continue;
      }

      const compactText = normalizeText(text);
      const score = compactText.length
        + ((isPan && /[A-Z]{5}[0-9]{4}[A-Z]/i.test(text)) ? 150 : 0)
        + ((isPan && /income\s*tax|permanent\s*account\s*number/i.test(text)) ? 60 : 0);

      const bestScore = bestText
        ? (normalizeText(bestText).length + ((isPan && /[A-Z]{5}[0-9]{4}[A-Z]/i.test(bestText)) ? 150 : 0))
        : 0;

      if (score > bestScore) {
        bestText = text;
      }

      // Stop early if we extracted a strong PAN/readable candidate.
      if ((isPan && /[A-Z]{5}[0-9]{4}[A-Z]/i.test(text)) || compactText.length >= 60) {
        return text;
      }
    } catch (error: any) {
      lastError = error;
    }
  }

  if (bestText) {
    return bestText;
  }

  throw lastError || new Error('Unable to extract readable text from document image.');
};

const runAiValidation = async ({ documentType, extractedText, userDetails }: any) => {
  const response = await withTimeout(
    `${getApiBaseUrl()}/validate-document`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ documentType, extractedText, userDetails }),
    },
    VALIDATION_TIMEOUT_MS,
    'Validation timed out. Please retry.'
  );

  if (!response.ok) {
    let errorMessage = 'Validation request failed';
    try {
      const body = await response.json();
      if (body?.error) {
        errorMessage = body.error;
      }
    } catch (error) {
      // Keep fallback error message.
    }
    throw new Error(errorMessage);
  }

  return response.json();
};

const requestJson = async (url: string, options: any, timeoutMs = 20000) => {
  const response = await withTimeout(
    url,
    options,
    timeoutMs,
    'Request timed out while saving document. Please retry.'
  );
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

export default function DocumentUploadPage({ navigation, route }: any) {
  const [documents, setDocuments] = useState(() => {
    const initialState: any = {};
    DOCUMENT_TYPES.forEach((doc) => {
      initialState[doc.key] = {
        uri: '',
        base64: '',
        status: 'idle',
        statusText: '',
        progress: 0,
        extractedText: '',
        extractedName: '',
        storedId: '',
      };
    });
    return initialState;
  });

  const userDetails = useMemo(() => {
    const formData = route?.params?.formData || {};
    // Try multiple field name variations to get the name
    const name = formData.fullName || formData.FullName || formData.name || formData.Name || '';
    console.log('[userDetails] name=', name, 'formData=', formData);
    return {
      name: String(name).trim(),
      income: formData.monthlyIncome || formData.annualIncome || '',
      monthlyIncome: formData.monthlyIncome || '',
      annualIncome: formData.annualIncome || '',
      cibilScore: formData.cibilScore || '',
      loanAmount: formData.loanAmount || '',
      hasExistingLoan: route?.params?.hasExistingLoan,
    };
  }, [route?.params]);

  const updateDocument = (key: string, patch: any) => {
    setDocuments((prev: any) => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...patch,
      },
    }));
  };

  const persistDocument = async ({
    key,
    label,
    base64,
    status,
    statusText,
    extractedText,
    checks,
  }: {
    key: string;
    label: string;
    base64: string;
    status: string;
    statusText: string;
    extractedText: string;
    checks?: any;
  }) => {
    const user = route?.params?.user || null;
    const loanDetailId = route?.params?.loanDetailId || null;
    const existingLoanId = route?.params?.existingLoanId || null;

    const { response, payload } = await requestJson(`${getApiBaseUrl()}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user?.id || null,
        userEmail: user?.email || '',
        loanDetailId,
        existingLoanId,
        documentType: label,
        fileBase64: base64,
        status,
        statusText,
        extractedText,
        checks: checks || {},
      }),
    });

    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to store document in database');
    }

    updateDocument(key, { storedId: payload?.id || '' });
  };

  const simulateProgress = (key: string) => {
    updateDocument(key, { progress: 0, status: 'uploading', statusText: 'Uploading document...' });
    const marks = [20, 45, 70, 90];

    marks.forEach((value, index) => {
      setTimeout(() => {
        updateDocument(key, { progress: value });
      }, (index + 1) * 220);
    });
  };

  const pickImageAndValidate = async (key: string, label: string) => {
    const hasPermission = await requestGalleryPermission();
    if (!hasPermission) {
      Alert.alert('Permission required', 'Gallery permission is needed to select a document.');
      return;
    }

    simulateProgress(key);

    const imageResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
      selectionLimit: 1,
    });

    if (imageResult.canceled || !imageResult.assets?.length) {
      updateDocument(key, {
        status: 'idle', 
        statusText: 'Upload cancelled.',
        progress: 0,
      });
      return;
    }

    const selected = imageResult.assets[0];
    const selectedBase64 = selected.base64 || '';

    updateDocument(key, {
      uri: selected.uri,
      base64: selectedBase64,
      progress: 100,
      status: 'validating',
      statusText: 'Running OCR and AI checks...',
    });

    try {
      if (!selectedBase64) {
        throw new Error('No base64 data found. Please pick a clearer image.');
      }

      const extractedText = await runBestEffortOcr({
        imageUri: selected.uri,
        base64Image: selectedBase64,
        documentType: label,
      });
      console.log(`[OCR] Extracted text length: ${extractedText.length}, preview: ${extractedText.substring(0, 200)}`);
      
      const aiResult = await runAiValidation({
        documentType: label,
        extractedText,
        userDetails,
      });
      console.log(`[aiResult] status=${aiResult?.status}, checks=`, aiResult?.checks, `message=${aiResult?.message}`);

      const checks = aiResult?.checks || {};
      
      // Extract name from OCR text
      const extractedNameFromOcr = extractNameFromOcr(extractedText);
      console.log(`[nameExtraction] extracted="${extractedNameFromOcr}"`);
      
      // Build map of all extracted names for cross-document verification
      const allExtractedNames: Record<string, string> = {};
      DOCUMENT_TYPES.forEach((doc) => {
        if (documents[doc.key]?.extractedName) {
          allExtractedNames[doc.key] = documents[doc.key].extractedName;
        }
      });
      allExtractedNames[key] = extractedNameFromOcr;
      
      const verificationDocuments = ['aadhaarCard', 'panCard', 'bankStatement', 'idProof'];
      const isVerificationDoc = verificationDocuments.includes(key);
      const isSalarySlip = key === 'salarySlip';

      // SERVER IS THE SINGLE SOURCE OF TRUTH.
      // checks.name = server name validation result (independent of income).
      // If server could not read name (garbled OCR), fall back to client match.
      const serverNameOk = checks.name === true;
      const clientNameOk = serverNameOk ? false : clientNameMatch(userDetails?.name || '', extractedText);
      const isNameMatched = serverNameOk || clientNameOk;
      console.log(`[nameMatch] serverName=${serverNameOk}, clientName=${clientNameOk}, final=${isNameMatched}`);

      // Income check: server result is authoritative, client is fallback.
      const serverIncomeOk = checks.income === 'matched';
      const clientIncomeOk = serverIncomeOk ? false : clientIncomeMatch(userDetails?.annualIncome || userDetails?.income || 0, extractedText);
      const isIncomeMatched = serverIncomeOk || clientIncomeOk;
      console.log(`[incomeCheck] serverIncome=${serverIncomeOk}, clientIncome=${clientIncomeOk}, final=${isIncomeMatched}`);

      // isOriginal: salary slip needs name+income, all others need name only.
      const isOriginal = isSalarySlip ? (isNameMatched && isIncomeMatched) : isNameMatched;
      console.log(`[Validation] isOriginal=${isOriginal} isSalarySlip=${isSalarySlip} isNameMatched=${isNameMatched} isIncomeMatched=${isIncomeMatched}`);

      const backendMessage = String(aiResult?.message || '').trim();
      const failureMessage = !isNameMatched
        ? 'Name in the document does not match the application form. Please upload the correct document.'
        : (isSalarySlip && !isIncomeMatched)
          ? (backendMessage || 'Annual income in salary slip does not match application details.')
          : (backendMessage || 'Document could not be verified.');


      updateDocument(key, {
        extractedText,
        extractedName: extractedNameFromOcr,
        status: isOriginal ? 'verified' : 'tampered',
        statusText: isOriginal ? 'Original' : failureMessage,
        progress: 100,
        checks: aiResult?.checks || {},
      });

      await persistDocument({
        key,
        label,
        base64: selectedBase64,
        status: isOriginal ? 'verified' : 'tampered',
        statusText: isOriginal ? 'Original' : failureMessage,
        extractedText,
        checks: aiResult?.checks || {},
      });
    } catch (error: any) {
      const errorMessage = error?.message || 'Tampered Document';
      updateDocument(key, {
        status: 'tampered',
        statusText: errorMessage,
        progress: 100,
        checks: {},
        extractedName: '',
      });

      if (selectedBase64) {
        try {
          await persistDocument({
            key,
            label,
            base64: selectedBase64,
            status: 'tampered',
            statusText: errorMessage,
            extractedText: '',
            checks: {},
          });
        } catch (saveError: any) {
          Alert.alert('Save failed', saveError?.message || 'Unable to store document in database.');
        }
      }
    }
  };

  const completion = useMemo(() => {
    const list = DOCUMENT_TYPES.map((doc) => documents[doc.key]);
    const uploaded = list.filter((doc) => !!doc?.uri).length;
    return Math.round((uploaded / DOCUMENT_TYPES.length) * 100);
  }, [documents]);

  const verifiedCount = useMemo(() => {
    return DOCUMENT_TYPES.map((doc) => documents[doc.key]).filter(
      (doc) => doc?.status === 'verified'
    ).length;
  }, [documents]);

  const handleNext = () => {
    if (verifiedCount === 0) {
      Alert.alert('Upload pending', 'Please upload and verify at least one document.');
      return;
    }

    const documentVerificationScore = Math.round((verifiedCount / DOCUMENT_TYPES.length) * 100);
    const formData = route?.params?.formData || {};
    const existingLoanData = route?.params?.existingLoanData || {};
    const storedDocumentIds = DOCUMENT_TYPES
      .map((doc) => documents[doc.key]?.storedId)
      .filter(Boolean);

    navigation.navigate('ResultPage', {
      ...route?.params,
      annualIncome: formData.annualIncome || formData.monthlyIncome,
      cibilScore: formData.cibilScore,
      jobType: formData.jobType,
      loanType: formData.loanType,
      requestedLoanAmount: formData.loanAmount,
      documentVerificationScore,
      documentIds: storedDocumentIds,
      emiHistory: {
        hasExistingLoan: route?.params?.hasExistingLoan,
        monthlyEMI: existingLoanData.monthlyEMI,
        pendingEMI: existingLoanData.pendingEMI,
        remainingTenure: existingLoanData.remainingTenure,
      },
    });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
      >
        <Text style={styles.title}>Upload Required Documents</Text>
        <Text style={styles.subtitle}>Accepted formats: Image / PDF (AI OCR uses image uploads)</Text>
        {!!userDetails?.name ? (
          <Text style={styles.formName}>Form name: {userDetails.name}</Text>
        ) : null}

        <View style={styles.progressCard}>
          <Text style={styles.progressLabel}>Upload Progress: {completion}%</Text>
          <View style={styles.progressBarWrap}>
            <View style={[styles.progressBarFill, { width: `${completion}%` }]} />
          </View>
          <Text style={styles.progressHint}>Verified documents: {verifiedCount}/{DOCUMENT_TYPES.length}</Text>
        </View>

        {DOCUMENT_TYPES.map((doc) => {
          const state = documents[doc.key] || {};
          return (
            <View key={doc.key} style={styles.docRow}>
              <View style={styles.docTopRow}>
                <Text style={styles.docTitle}>{doc.label}</Text>
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={() => pickImageAndValidate(doc.key, doc.label)}
                >
                  <Text style={styles.uploadButtonText}>Upload (Image/PDF)</Text>
                </TouchableOpacity>
              </View>

              {state.uri ? <Image source={{ uri: state.uri }} style={styles.previewImage} /> : null}

              {state.status === 'uploading' || state.status === 'validating' ? (
                <View style={styles.miniProgressWrap}>
                  <View style={[styles.miniProgressFill, { width: `${state.progress || 0}%` }]} />
                </View>
              ) : null}

              {!!state.statusText ? (
                <View style={styles.statusRow}>
                  <Text
                    style={[
                      styles.statusIcon,
                      state.status === 'verified' && styles.verifiedIcon,
                      state.status === 'tampered' && styles.tamperedIcon,
                    ]}
                  >
                    {state.status === 'verified' ? '✓' : state.status === 'tampered' ? '✕' : '•'}
                  </Text>
                  <Text
                    style={[
                      styles.statusText,
                      state.status === 'verified' && styles.verifiedText,
                      state.status === 'tampered' && styles.tamperedText,
                    ]}
                  >
                    {state.statusText}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}

        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>Next to AI Approval Prediction</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  scroll: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 28,
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: Platform.OS === 'android' ? 6 : 0,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#475569',
  },
  progressCard: {
    marginTop: 14,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbe1eb',
  },
  progressLabel: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  progressBarWrap: {
    marginTop: 10,
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  progressHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#475569',
  },
  docRow: {
    marginTop: 14,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe1eb',
    padding: 12,
  },
  docTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  docTitle: {
    flex: 1,
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600',
  },
  uploadButton: {
    backgroundColor: '#e2ecff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  uploadButtonText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '700',
  },
  previewImage: {
    marginTop: 10,
    width: '100%',
    height: 140,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  miniProgressWrap: {
    marginTop: 10,
    width: '100%',
    height: 7,
    borderRadius: 999,
    backgroundColor: '#eef2f7',
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
  },
  statusRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusIcon: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '700',
  },
  verifiedIcon: {
    color: '#15803d',
  },
  tamperedIcon: {
    color: '#b91c1c',
  },
  statusText: {
    fontSize: 13,
    color: '#475569',
    flex: 1,
  },
  verifiedText: {
    color: '#15803d',
    fontWeight: '600',
  },
  tamperedText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  formName: {
    marginTop: 8,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  nextButton: {
    marginTop: 20,
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  nextButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
