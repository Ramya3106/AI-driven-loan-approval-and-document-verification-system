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

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'OCR API request failed' });
    }

    const data = await response.json();
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

app.post('/validate-document', (req, res) => {
  try {
    const { documentType, extractedText, userDetails } = req.body || {};

    if (!documentType || typeof extractedText !== 'string') {
      return res.status(400).json({ error: 'documentType and extractedText are required' });
    }

    const cleanedText = extractedText.trim();
    const normalizedText = normalizeText(cleanedText);
    const normalizedName = normalizeText(userDetails?.name || '');
    const incomeValue = String(userDetails?.income || '').replace(/[^0-9]/g, '');
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

    if (normalizedName) {
      const nameTokens = normalizedName.split(/\s+/).filter(Boolean);
      const nameMatch = normalizedText.includes(normalizedName)
        || nameTokens.every((token) => normalizedText.includes(token));
      if (!nameMatch) {
        issues.push('Name does not match provided applicant details.');
      }
    }

    if (normalizeText(documentType).includes('salaryslip') && incomeValue) {
      const numericCandidates = extractNumericCandidates(cleanedText);
      if (!numericCandidates.some((value) => value.includes(incomeValue))) {
        issues.push('Income mismatch in salary slip validation.');
      }
    }

    const criticalIssue = issues.some((issue) =>
      issue.includes('Name does not match')
      || issue.includes('Income mismatch')
      || issue.includes('insufficient')
    );

    const status = criticalIssue || issues.length >= 3 ? 'Tampered Document' : 'Original Document';
    return res.status(200).json({
      status,
      message: status === 'Original Document' ? 'Document passed AI checks.' : issues.join(' '),
      checks: {
        watermark: !issues.some((issue) => issue.includes('watermark')),
        layout: !issues.some((issue) => issue.includes('layout')),
        tampering: status === 'Original Document',
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