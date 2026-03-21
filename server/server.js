const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/loanapproval';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error.message);
  });

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/ocr', async (req, res) => {
  try {
    const { base64Image } = req.body || {};
    if (!base64Image) {
      return res.status(400).json({ error: 'Missing base64Image' });
    }

    const apiKey = process.env.OCR_SPACE_API_KEY || 'helloworld';
    const body = new URLSearchParams();
    body.append('apikey', apiKey);
    body.append('language', 'eng');
    body.append('isOverlayRequired', 'false');
    body.append('base64Image', `data:image/jpg;base64,${base64Image}`);

    const tryOcrEndpoint = async (endpoint) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
          signal: controller.signal,
        });

        let payload = null;
        try {
          payload = await response.json();
        } catch (parseError) {
          payload = null;
        }

        if (!response.ok) {
          return {
            ok: false,
            error:
              payload?.ErrorMessage || payload?.error || `OCR API request failed (${response.status})`,
          };
        }

        return { ok: true, payload };
      } catch (error) {
        if (error?.name === 'AbortError') {
          return { ok: false, error: 'OCR timed out after 45 seconds' };
        }

        return { ok: false, error: error?.message || 'OCR provider call failed' };
      } finally {
        clearTimeout(timeout);
      }
    };

    const primaryResult = await tryOcrEndpoint('https://api.ocr.space/parse/image');
    const finalResult = primaryResult.ok
      ? primaryResult
      : await tryOcrEndpoint('https://apipro1.ocr.space/parse/image');

    if (!finalResult.ok) {
      return res.status(502).json({ error: finalResult.error || 'OCR API request failed' });
    }

    const data = finalResult.payload;
    if (data?.IsErroredOnProcessing) {
      return res.status(422).json({ error: data?.ErrorMessage || 'OCR processing error' });
    }

    const parsedText = (data?.ParsedResults || [])
      .map((result) => result?.ParsedText || '')
      .join(' ')
      .trim();

    if (!parsedText) {
      return res.status(422).json({ error: 'OCR returned empty text' });
    }

    return res.json({ text: parsedText });
  } catch (error) {
    console.error('OCR server error:', error.message);
    return res.status(500).json({ error: 'OCR server error' });
  }
});

const normalizeText = (value = '') => value.toLowerCase().replace(/[^a-z0-9]/g, '');

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

const levenshteinDistance = (left = '', right = '') => {
  if (!left) {
    return right.length;
  }
  if (!right) {
    return left.length;
  }

  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + substitutionCost
      );
    }
  }

  return matrix[rows - 1][cols - 1];
};

const isTokenMatch = (expectedToken = '', candidateToken = '') => {
  if (!expectedToken || !candidateToken) {
    return false;
  }

  if (expectedToken === candidateToken) {
    return true;
  }

  const distance = levenshteinDistance(expectedToken, candidateToken);
  const allowance = expectedToken.length >= 7 ? 2 : 1;
  return distance <= allowance;
};

const findBestWindowSimilarity = (expectedTokens = [], extractedTokens = []) => {
  if (!expectedTokens.length || !extractedTokens.length) {
    return 0;
  }

  const windowSize = expectedTokens.length;
  if (extractedTokens.length < windowSize) {
    const expectedJoined = expectedTokens.join('');
    const extractedJoined = extractedTokens.join('');
    const distance = levenshteinDistance(expectedJoined, extractedJoined);
    return 1 - distance / Math.max(expectedJoined.length, extractedJoined.length, 1);
  }

  const expectedJoined = expectedTokens.join('');
  let bestSimilarity = 0;

  for (let index = 0; index <= extractedTokens.length - windowSize; index += 1) {
    const windowJoined = extractedTokens.slice(index, index + windowSize).join('');
    const distance = levenshteinDistance(expectedJoined, windowJoined);
    const similarity = 1 - distance / Math.max(expectedJoined.length, windowJoined.length, 1);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
    }
  }

  return bestSimilarity;
};

const verifyNameMatch = (applicantName = '', extractedText = '') => {
  const expectedTokens = tokenizeName(applicantName);
  if (!expectedTokens.length) {
    return {
      isMatch: false,
      reason: 'Applicant name is missing from provided details.',
      confidence: 0,
    };
  }

  const extractedTokens = tokenizeName(extractedText);
  if (!extractedTokens.length) {
    return {
      isMatch: false,
      reason: 'Unable to read a valid name from OCR text.',
      confidence: 0,
    };
  }

  const matchedTokenCount = expectedTokens.filter((expectedToken) =>
    extractedTokens.some((candidateToken) => isTokenMatch(expectedToken, candidateToken))
  ).length;

  const tokenCoverage = matchedTokenCount / expectedTokens.length;
  const fullNameSimilarity = findBestWindowSimilarity(expectedTokens, extractedTokens);

  const isMatch = tokenCoverage === 1 || (tokenCoverage >= 0.67 && fullNameSimilarity >= 0.82);
  const confidence = Number((tokenCoverage * 0.6 + fullNameSimilarity * 0.4).toFixed(2));

  return {
    isMatch,
    confidence,
    reason: isMatch
      ? 'Applicant name matched with OCR output.'
      : 'Name extracted from OCR does not match the provided applicant name.',
  };
};

const detectSuspiciousLayout = (text = '') => {
  const compact = text.replace(/\s+/g, '');
  if (!compact) {
    return true;
  }

  const repeatedPattern = /(.)\1{6,}/.test(compact);
  const symbolRatio = (compact.match(/[^a-zA-Z0-9]/g) || []).length / compact.length;
  return repeatedPattern || symbolRatio > 0.35;
};

const hasWatermarkSignals = (text = '') => {
  const normalized = normalizeText(text);
  const suspiciousMarkers = ['samplecopy', 'duplicatecopy', 'fortrainingonly', 'notvalid'];
  return suspiciousMarkers.some((marker) => normalized.includes(marker));
};

const extractNumericCandidates = (text = '') => {
  return text
    .replace(/,/g, '')
    .match(/\d{4,}/g) || [];
};

const toPositiveNumber = (value = '') => {
  const digitsOnly = String(value).replace(/[^0-9]/g, '');
  const parsed = Number(digitsOnly);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const evaluateSalaryIncomeMatch = ({ text = '', expectedValues = [] }) => {
  const normalized = normalizeWithSpaces(text);
  const salaryKeywords = ['salary', 'payslip', 'ctc', 'annual', 'monthly', 'gross', 'net'];
  const hasSalaryContext = salaryKeywords.some((keyword) => normalized.includes(keyword));

  const numericCandidates = extractNumericCandidates(text)
    .map((value) => toPositiveNumber(value))
    .filter((value) => value >= 1000 && !(value >= 1900 && value <= 2100));

  if (!expectedValues.length || !numericCandidates.length) {
    return { outcome: 'inconclusive' };
  }

  const expectedList = expectedValues.filter((value) => value > 0);
  const hasMatch = numericCandidates.some((candidate) =>
    expectedList.some((expected) => {
      const tolerance = Math.max(200, Math.round(expected * 0.05));
      const directMatch = Math.abs(candidate - expected) <= tolerance;

      // OCR sometimes drops/adds a trailing zero (e.g. 600000 -> 60000).
      const oneZeroScaleMatch =
        Math.abs(candidate * 10 - expected) <= tolerance
        || Math.abs(candidate - expected * 10) <= tolerance;

      return directMatch || oneZeroScaleMatch;
    })
  );

  if (hasMatch) {
    return { outcome: 'matched' };
  }

  const hasConflictingAmount = numericCandidates.some((candidate) =>
    expectedList.some((expected) => {
      const tolerance = Math.max(200, Math.round(expected * 0.05));
      const ratio = candidate / expected;
      return ratio >= 0.5 && ratio <= 2 && Math.abs(candidate - expected) > tolerance;
    })
  );

  if (!hasSalaryContext || !hasConflictingAmount) {
    return { outcome: 'inconclusive' };
  }

  return { outcome: 'mismatch' };
};

app.post('/validate-document', (req, res) => {
  try {
    const { documentType, extractedText, userDetails } = req.body || {};

    if (!documentType || typeof extractedText !== 'string') {
      return res.status(400).json({ error: 'documentType and extractedText are required' });
    }

    const cleanedText = extractedText.trim();
    const normalizedText = normalizeText(cleanedText);
    const applicantName = String(userDetails?.name || '');
    const monthlyIncome = toPositiveNumber(userDetails?.monthlyIncome || userDetails?.income);
    const annualIncome = toPositiveNumber(userDetails?.annualIncome) || (monthlyIncome ? monthlyIncome * 12 : 0);
    const issues = [];

    if (!cleanedText || cleanedText.length < 30) {
      issues.push('Very little readable content. OCR text is insufficient.');
    }

    if (hasWatermarkSignals(cleanedText)) {
      issues.push('Possible watermark inconsistency detected in OCR text.');
    }

    if (detectSuspiciousLayout(cleanedText)) {
      issues.push('Font/layout irregularity detected by text pattern check.');
    }

    const nameValidation = verifyNameMatch(applicantName, cleanedText);
    if (!nameValidation.isMatch) {
      issues.push(nameValidation.reason);
    }

    let incomeCheck = 'not_applicable';
    if (normalizeText(documentType).includes('salaryslip') && (annualIncome || monthlyIncome)) {
      const expectedIncomeValues = [];
      if (annualIncome) {
        expectedIncomeValues.push(annualIncome);
      }
      if (monthlyIncome) {
        expectedIncomeValues.push(monthlyIncome);
      }

      const incomeEvaluation = evaluateSalaryIncomeMatch({
        text: cleanedText,
        expectedValues: expectedIncomeValues,
      });

      incomeCheck = incomeEvaluation.outcome;
      if (incomeEvaluation.outcome === 'mismatch') {
        issues.push('Income mismatch in salary slip validation.');
      }
    }

    const criticalIssue = issues.some((issue) =>
      issue.includes('does not match')
      || issue.includes('Income mismatch')
      || issue.includes('insufficient')
    );

    const status = criticalIssue || issues.length >= 3 ? 'Tampered' : 'Original';
    return res.status(200).json({
      status,
      message: status === 'Original' ? 'Document passed AI checks.' : issues.join(' '),
      checks: {
        name: nameValidation.isMatch,
        nameConfidence: nameValidation.confidence,
        income: incomeCheck,
        watermark: !issues.some((issue) => issue.includes('watermark')),
        layout: !issues.some((issue) => issue.includes('layout')),
        tampering: status === 'Original',
      },
      issues,
    });
  } catch (error) {
    console.error('Validation server error:', error.message);
    return res.status(500).json({ error: 'Validation server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});