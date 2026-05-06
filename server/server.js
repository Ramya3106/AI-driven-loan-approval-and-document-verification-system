const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createWorker } = require('tesseract.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/loanapproval';
const OCR_SPACE_API_KEY = String(process.env.OCR_SPACE_API_KEY || '').trim();
const hasRealOcrSpaceKey =
  OCR_SPACE_API_KEY && !/^your_/i.test(OCR_SPACE_API_KEY) && OCR_SPACE_API_KEY !== 'helloworld';

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

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    lastLoginAt: { type: Date, default: null },
    loginCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

const loanDetailSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userEmail: { type: String, default: '' },
    fullName: { type: String, required: true, trim: true },
    jobType: { type: String, required: true, trim: true },
    annualIncome: { type: Number, required: true },
    monthlyIncome: { type: Number, required: true },
    cibilScore: { type: Number, required: true },
    loanType: { type: String, required: true, trim: true },
    loanAmount: { type: Number, required: true },
  },
  { timestamps: true, collection: 'loandetails' }
);

const existingLoanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userEmail: { type: String, default: '' },
    loanDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'LoanDetail', default: null },
    hasExistingLoan: { type: Boolean, required: true },
    loanType: { type: String, default: '' },
    totalLoanAmount: { type: Number, default: 0 },
    monthlyEMI: { type: Number, default: 0 },
    remainingTenure: { type: Number, default: 0 },
    pendingEMI: { type: String, default: '' },
    verificationStatus: { type: String, default: 'not_required' },
    verificationMessage: { type: String, default: '' },
  },
  { timestamps: true, collection: 'existingloans' }
);

const documentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userEmail: { type: String, default: '' },
    loanDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'LoanDetail', default: null },
    existingLoanId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExistingLoan', default: null },
    documentType: { type: String, required: true, trim: true },
    fileBase64: { type: String, required: true },
    status: { type: String, default: 'uploaded' },
    statusText: { type: String, default: '' },
    extractedText: { type: String, default: '' },
  },
  { timestamps: true, collection: 'documents' }
);

const loanApprovalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userEmail: { type: String, default: '' },
    loanDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'LoanDetail', default: null },
    existingLoanId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExistingLoan', default: null },
    documentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
    annualIncome: { type: Number, default: 0 },
    cibilScore: { type: Number, default: 0 },
    jobType: { type: String, default: '' },
    loanType: { type: String, default: '' },
    requestedLoanAmount: { type: Number, default: 0 },
    suggestedLoanAmount: { type: Number, default: 0 },
    approvalPercentage: { type: Number, default: 0 },
    decisionLabel: { type: String, default: '' },
    documentVerificationScore: { type: Number, default: 0 },
    emiHistory: {
      hasExistingLoan: { type: Boolean, default: false },
      monthlyEMI: { type: Number, default: 0 },
      pendingEMI: { type: String, default: '' },
      remainingTenure: { type: Number, default: 0 },
    },
  },
  { timestamps: true, collection: 'loanapprovals' }
);

const LoanDetail = mongoose.models.LoanDetail || mongoose.model('LoanDetail', loanDetailSchema);
const ExistingLoan = mongoose.models.ExistingLoan || mongoose.model('ExistingLoan', existingLoanSchema);
const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);
const LoanApproval = mongoose.models.LoanApproval || mongoose.model('LoanApproval', loanApprovalSchema);

const normalizeBase64Image = (base64Image = '') => {
  const trimmed = String(base64Image || '').trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  return `data:image/jpeg;base64,${trimmed}`;
};

const runLocalOcr = async (base64Image = '') => {
  const imageData = normalizeBase64Image(base64Image);
  if (!imageData) {
    throw new Error('Missing base64Image');
  }

  const worker = await createWorker('eng', 1, {
    logger: () => {},
    errorHandler: () => {},
  });

  try {
    const result = await worker.recognize(imageData);
    return String(result?.data?.text || '').trim();
  } finally {
    await worker.terminate();
  }
};

const toNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

app.post('/api/loan-details', async (req, res) => {
  try {
    const {
      userId,
      userEmail,
      fullName,
      jobType,
      annualIncome,
      monthlyIncome,
      cibilScore,
      loanType,
      loanAmount,
    } = req.body || {};

    const normalizedName = String(fullName || '').trim();
    const normalizedJobType = String(jobType || '').trim();
    const normalizedLoanType = String(loanType || '').trim();

    if (
      !normalizedName
      || !normalizedJobType
      || !normalizedLoanType
      || !annualIncome
      || !monthlyIncome
      || !cibilScore
      || !loanAmount
    ) {
      return res.status(400).json({ error: 'Missing required loan detail fields' });
    }

    const created = await LoanDetail.create({
      userId: userId || null,
      userEmail: String(userEmail || '').trim().toLowerCase(),
      fullName: normalizedName,
      jobType: normalizedJobType,
      annualIncome: toNumber(annualIncome),
      monthlyIncome: toNumber(monthlyIncome),
      cibilScore: toNumber(cibilScore),
      loanType: normalizedLoanType,
      loanAmount: toNumber(loanAmount),
    });

    return res.status(201).json({ message: 'Loan details stored', id: created._id });
  } catch (error) {
    console.error('Loan details save error:', error.message);
    return res.status(500).json({ error: 'Failed to save loan details' });
  }
});

app.post('/api/existing-loans', async (req, res) => {
  try {
    const {
      userId,
      userEmail,
      loanDetailId,
      hasExistingLoan,
      loanType,
      totalLoanAmount,
      monthlyEMI,
      remainingTenure,
      pendingEMI,
      verificationStatus,
      verificationMessage,
    } = req.body || {};

    if (typeof hasExistingLoan !== 'boolean') {
      return res.status(400).json({ error: 'hasExistingLoan must be provided' });
    }

    const created = await ExistingLoan.create({
      userId: userId || null,
      userEmail: String(userEmail || '').trim().toLowerCase(),
      loanDetailId: loanDetailId || null,
      hasExistingLoan,
      loanType: String(loanType || '').trim(),
      totalLoanAmount: toNumber(totalLoanAmount),
      monthlyEMI: toNumber(monthlyEMI),
      remainingTenure: toNumber(remainingTenure),
      pendingEMI: String(pendingEMI || '').trim().toLowerCase(),
      verificationStatus: String(verificationStatus || (hasExistingLoan ? 'pending' : 'not_required')),
      verificationMessage: String(verificationMessage || '').trim(),
    });

    return res.status(201).json({ message: 'Existing loan details stored', id: created._id });
  } catch (error) {
    console.error('Existing loan save error:', error.message);
    return res.status(500).json({ error: 'Failed to save existing loan details' });
  }
});

app.post('/api/documents', async (req, res) => {
  try {
    const {
      userId,
      userEmail,
      loanDetailId,
      existingLoanId,
      documentType,
      fileBase64,
      status,
      statusText,
      extractedText,
    } = req.body || {};

    const normalizedType = String(documentType || '').trim();
    const normalizedBase64 = String(fileBase64 || '').trim();

    if (!normalizedType || !normalizedBase64) {
      return res.status(400).json({ error: 'documentType and fileBase64 are required' });
    }

    const created = await Document.create({
      userId: userId || null,
      userEmail: String(userEmail || '').trim().toLowerCase(),
      loanDetailId: loanDetailId || null,
      existingLoanId: existingLoanId || null,
      documentType: normalizedType,
      fileBase64: normalizedBase64,
      status: String(status || 'uploaded').trim(),
      statusText: String(statusText || '').trim(),
      extractedText: String(extractedText || '').trim(),
    });

    return res.status(201).json({ message: 'Document stored', id: created._id });
  } catch (error) {
    console.error('Document save error:', error.message);
    return res.status(500).json({ error: 'Failed to save document' });
  }
});

app.post('/api/loan-approvals', async (req, res) => {
  try {
    const {
      userId,
      userEmail,
      loanDetailId,
      existingLoanId,
      documentIds,
      annualIncome,
      cibilScore,
      jobType,
      loanType,
      requestedLoanAmount,
      suggestedLoanAmount,
      approvalPercentage,
      decisionLabel,
      documentVerificationScore,
      emiHistory,
    } = req.body || {};

    const created = await LoanApproval.create({
      userId: userId || null,
      userEmail: String(userEmail || '').trim().toLowerCase(),
      loanDetailId: loanDetailId || null,
      existingLoanId: existingLoanId || null,
      documentIds: Array.isArray(documentIds) ? documentIds.filter(Boolean) : [],
      annualIncome: toNumber(annualIncome),
      cibilScore: toNumber(cibilScore),
      jobType: String(jobType || '').trim(),
      loanType: String(loanType || '').trim(),
      requestedLoanAmount: toNumber(requestedLoanAmount),
      suggestedLoanAmount: toNumber(suggestedLoanAmount),
      approvalPercentage: toNumber(approvalPercentage),
      decisionLabel: String(decisionLabel || '').trim(),
      documentVerificationScore: toNumber(documentVerificationScore),
      emiHistory: {
        hasExistingLoan: Boolean(emiHistory?.hasExistingLoan),
        monthlyEMI: toNumber(emiHistory?.monthlyEMI),
        pendingEMI: String(emiHistory?.pendingEMI || '').trim().toLowerCase(),
        remainingTenure: toNumber(emiHistory?.remainingTenure),
      },
    });

    return res.status(201).json({ message: 'Loan approval stored', id: created._id });
  } catch (error) {
    console.error('Loan approval save error:', error.message);
    return res.status(500).json({ error: 'Failed to save loan approval' });
  }
});

app.get('/api/users/pipeline', async (req, res) => {
  try {
    const rawUserId = String(req.query.userId || '').trim();
    const rawEmail = String(req.query.email || '').trim().toLowerCase();

    if (!rawUserId && !rawEmail) {
      return res.status(400).json({ error: 'Provide userId or email query parameter' });
    }

    let user = null;

    if (rawUserId) {
      if (!mongoose.Types.ObjectId.isValid(rawUserId)) {
        return res.status(400).json({ error: 'Invalid userId format' });
      }
      user = await User.findById(rawUserId).lean();
    }

    if (!user && rawEmail) {
      user = await User.findOne({ email: rawEmail }).lean();
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = user._id;
    const userEmail = String(user.email || '').toLowerCase();

    const [loanDetails, existingLoans, documents, loanApprovals] = await Promise.all([
      LoanDetail.find({ $or: [{ userId }, { userEmail }] }).sort({ createdAt: -1 }).lean(),
      ExistingLoan.find({ $or: [{ userId }, { userEmail }] }).sort({ createdAt: -1 }).lean(),
      Document.find({ $or: [{ userId }, { userEmail }] }).sort({ createdAt: -1 }).lean(),
      LoanApproval.find({ $or: [{ userId }, { userEmail }] }).sort({ createdAt: -1 }).lean(),
    ]);

    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt || null,
      loginCount: Number(user.loginCount || 0),
    };

    return res.status(200).json({
      user: userResponse,
      loanDetails,
      existingLoans,
      documents,
      loanApprovals,
      counts: {
        loanDetails: loanDetails.length,
        existingLoans: existingLoans.length,
        documents: documents.length,
        loanApprovals: loanApprovals.length,
      },
    });
  } catch (error) {
    console.error('Pipeline fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch user pipeline data' });
  }
});

const otpStore = new Map();
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const allowOtpDevFallback =
  String(process.env.ALLOW_OTP_DEV_FALLBACK || 'true').toLowerCase() !== 'false';

const sendOtpViaEmailJs = async ({ toName, toEmail, otp }) => {
  const serviceId = String(process.env.EMAILJS_SERVICE_ID || '').trim();
  const templateId = String(process.env.EMAILJS_TEMPLATE_ID || '').trim();
  const publicKey = String(process.env.EMAILJS_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.EMAILJS_PRIVATE_KEY || '').trim();

  if (!serviceId || !templateId || !publicKey || !privateKey) {
    throw new Error('EMAILJS_NOT_CONFIGURED');
  }

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        to_name: toName,
        to_email: toEmail,
        email: toEmail,
        toEmail,
        user_email: toEmail,
        otp,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EMAILJS_SEND_FAILED:${response.status}:${errorText}`);
  }
};

app.post('/auth/send-otp', async (req, res) => {
  try {
    const { name, email } = req.body || {};
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedName || !normalizedEmail) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    otpStore.set(normalizedEmail, {
      otp,
      name: normalizedName,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    await sendOtpViaEmailJs({
      toName: normalizedName,
      toEmail: normalizedEmail,
      otp,
    });

    return res.status(200).json({
      message: 'OTP sent successfully to your email.',
      deliveryMode: 'emailjs',
    });
  } catch (error) {
    console.error('Send OTP error:', error.message);
    const isEmailConfigError = String(error.message || '').includes('EMAILJS_NOT_CONFIGURED');
    const isEmailSendError = String(error.message || '').includes('EMAILJS_SEND_FAILED');
    const hasInvalidGrant = String(error.message || '').toLowerCase().includes('invalid grant');

    if ((isEmailConfigError || isEmailSendError) && !isProduction && allowOtpDevFallback) {
      const fallbackEntry = otpStore.get(String(req.body?.email || '').trim().toLowerCase());
      return res.status(200).json({
        message:
          'Email service is unavailable. OTP generated in development fallback mode. Use the OTP shown here.',
        deliveryMode: 'development-fallback',
        otp: fallbackEntry?.otp || null,
      });
    }

    if (isEmailConfigError) {
      return res.status(500).json({
        error:
          'EmailJS is not configured. Set EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, and EMAILJS_PRIVATE_KEY in server/.env.',
      });
    }

    if (isEmailSendError && hasInvalidGrant) {
      return res.status(500).json({
        error:
          'EmailJS Gmail connection expired (Invalid grant). Reconnect your Gmail account in EmailJS service settings, then retry OTP.',
      });
    }

    if (isEmailSendError) {
      return res.status(500).json({
        error: 'Failed to send OTP via EmailJS. Verify service/template/public/private keys and connected email provider.',
      });
    }

    return res.status(500).json({ error: 'Failed to send OTP email' });
  }
});

app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, otp, password } = req.body || {};
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedOtp = String(otp || '').trim();
    const normalizedPassword = String(password || '');

    if (!normalizedName || !normalizedEmail || !normalizedOtp || !normalizedPassword) {
      return res.status(400).json({ error: 'Name, email, OTP and password are required' });
    }

    if (normalizedPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const otpEntry = otpStore.get(normalizedEmail);
    if (!otpEntry) {
      return res.status(400).json({ error: 'Please request OTP first' });
    }

    if (Date.now() > otpEntry.expiresAt) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
    }

    if (otpEntry.otp !== normalizedOtp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail }).lean();
    if (existingUser) {
      otpStore.delete(normalizedEmail);
      return res.status(409).json({ error: 'Email is already registered. Please login.' });
    }

    const passwordHash = await bcrypt.hash(normalizedPassword, 10);

    await User.create({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
    });

    otpStore.delete(normalizedEmail);

    return res.status(201).json({
      message: 'Registration successful. Please login.',
    });
  } catch (error) {
    console.error('Register error:', error.message);
    return res.status(500).json({ error: 'Failed to register user' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPassword = String(password || '');

    if (!normalizedEmail || !normalizedPassword) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await bcrypt.compare(normalizedPassword, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    user.lastLoginAt = new Date();
    user.loginCount = Number(user.loginCount || 0) + 1;
    await user.save();

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/ocr', async (req, res) => {
  try {
    const { base64Image, documentType } = req.body || {};
    if (!base64Image) {
      return res.status(400).json({ error: 'Missing base64Image' });
    }

    try {
      const localText = await runLocalOcr(base64Image);
      if (localText) {
        return res.json({ text: localText, source: 'tesseract' });
      }
    } catch (error) {
      console.error('Local OCR error:', error.message);
    }

    if (!hasRealOcrSpaceKey) {
      return res.status(422).json({
        error: 'Unable to read text from the uploaded image. Please upload a clearer image.',
      });
    }

    const apiKey = OCR_SPACE_API_KEY;

    const scoreOcrText = (text = '', docTypeLabel = '') => {
      const compact = normalizeText(text);
      if (!compact) {
        return 0;
      }

      let score = compact.length;
      const panRegex = /[A-Z]{5}[0-9]{4}[A-Z]/i;
      const hasPanNumber = panRegex.test(text);
      if (hasPanNumber) {
        score += 120;
      }

      const docTypeKey = normalizeText(String(docTypeLabel));
      if (docTypeKey.includes('pancard')) {
        if (/income\s*tax/i.test(text)) {
          score += 35;
        }
        if (/permanent\s*account\s*number/i.test(text)) {
          score += 50;
        }
      }

      return score;
    };

    const buildBody = ({ ocrEngine = '2', detectOrientation = 'true', scale = 'true' }) => {
      const body = new URLSearchParams();
      body.append('apikey', apiKey);
      body.append('language', 'eng');
      body.append('isOverlayRequired', 'false');
      body.append('OCREngine', ocrEngine);
      body.append('detectOrientation', detectOrientation);
      body.append('scale', scale);
      body.append('base64Image', `data:image/jpg;base64,${base64Image}`);
      return body;
    };

    const OCR_ATTEMPT_TIMEOUT_MS = 12000;

    const tryOcrEndpoint = async (endpoint, body) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), OCR_ATTEMPT_TIMEOUT_MS);

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
          return { ok: false, error: `OCR provider timed out after ${OCR_ATTEMPT_TIMEOUT_MS / 1000} seconds` };
        }

        return { ok: false, error: error?.message || 'OCR provider call failed' };
      } finally {
        clearTimeout(timeout);
      }
    };

    const isPanCard = normalizeText(String(documentType)).includes('pancard');
    const requestProfiles = isPanCard
      ? [
        buildBody({ ocrEngine: '2', detectOrientation: 'true', scale: 'true' }),
        buildBody({ ocrEngine: '1', detectOrientation: 'true', scale: 'true' }),
        buildBody({ ocrEngine: '2', detectOrientation: 'true', scale: 'false' }),
      ]
      : [
        buildBody({ ocrEngine: '2', detectOrientation: 'true', scale: 'true' }),
        buildBody({ ocrEngine: '1', detectOrientation: 'true', scale: 'true' }),
      ];

    const endpoints = ['https://api.ocr.space/parse/image', 'https://apipro1.ocr.space/parse/image'];
    const candidates = [];
    let bestCandidate = null;
    const strongScoreThreshold = isPanCard ? 170 : 120;
    let lastError = null;

    for (const profile of requestProfiles) {
      for (const endpoint of endpoints) {
        const result = await tryOcrEndpoint(endpoint, profile);
        if (!result.ok) {
          lastError = result.error || lastError;
          continue;
        }

        const data = result.payload;
        if (data?.IsErroredOnProcessing) {
          lastError = data?.ErrorMessage || lastError;
          continue;
        }

        const parsedText = (data?.ParsedResults || [])
          .map((entry) => entry?.ParsedText || '')
          .join(' ')
          .trim();

        if (parsedText) {
          const score = scoreOcrText(parsedText, documentType);
          candidates.push({ text: parsedText, score });

          if (!bestCandidate || score > bestCandidate.score) {
            bestCandidate = { text: parsedText, score };
          }

          // Stop early once we have a high-confidence OCR candidate.
          if (bestCandidate.score >= strongScoreThreshold) {
            return res.json({ text: bestCandidate.text });
          }
        }
      }
    }

    if (!candidates.length) {
      return res.status(502).json({ error: lastError || 'OCR API request failed' });
    }

    const parsedText = candidates
      .sort((left, right) => right.score - left.score)[0]?.text || '';

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

  // OCR may merge full names or initials into one token (e.g. "manikandanm").
  if (
    (candidateToken.includes(expectedToken) && expectedToken.length >= 3)
    || (expectedToken.includes(candidateToken) && candidateToken.length >= 3)
  ) {
    return true;
  }

  const distance = levenshteinDistance(expectedToken, candidateToken);
  const allowance = expectedToken.length >= 7 ? 2 : 1;
  return distance <= allowance;
};

const findBestCompactSimilarity = (expectedCompact = '', extractedCompact = '') => {
  if (!expectedCompact || !extractedCompact) {
    return 0;
  }

  if (extractedCompact.includes(expectedCompact)) {
    return 1;
  }

  const expectedLength = expectedCompact.length;
  const extractedLength = extractedCompact.length;

  if (extractedLength <= expectedLength) {
    const distance = levenshteinDistance(expectedCompact, extractedCompact);
    return 1 - distance / Math.max(expectedLength, extractedLength, 1);
  }

  let bestSimilarity = 0;
  for (let index = 0; index <= extractedLength - expectedLength; index += 1) {
    const window = extractedCompact.slice(index, index + expectedLength);
    const distance = levenshteinDistance(expectedCompact, window);
    const similarity = 1 - distance / Math.max(expectedLength, window.length, 1);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
    }
  }

  return bestSimilarity;
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
  const expectedCompact = normalizeText(applicantName);
  if (!expectedTokens.length) {
    return {
      isMatch: false,
      reason: 'Applicant name is missing from provided details.',
      confidence: 0,
    };
  }

  const extractedTokens = tokenizeName(extractedText);
  const extractedCompact = normalizeText(extractedText);
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
  const compactSimilarity = findBestCompactSimilarity(expectedCompact, extractedCompact);

  // More tolerant matching: accept if enough tokens match or if name is found in extracted text
  const isMatch =
    extractedCompact.includes(expectedCompact) // Exact compact match
    || tokenCoverage >= 0.5 // At least 50% of tokens match
    || (tokenCoverage >= 0.33 && compactSimilarity >= 0.8) // Some tokens + decent similarity
    || compactSimilarity >= 0.85; // High compact similarity alone

  const confidence = Number((tokenCoverage * 0.45 + fullNameSimilarity * 0.25 + compactSimilarity * 0.3).toFixed(2));

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

  // Allow smaller numbers (monthly amounts) as well so we can compare monthly vs annual
  const numericCandidates = extractNumericCandidates(text)
    .map((value) => toPositiveNumber(value))
    .filter((value) => value >= 100 && !(value >= 1900 && value <= 2100));

  const expectedList = expectedValues.filter((value) => value > 0);

  // If expected provided but OCR returned no clear numeric candidates, try a raw token search
  if (expectedList.length && !numericCandidates.length) {
    const rawDigitsTokens = (text || '')
      .replace(/[,\s]/g, ' ')
      .split(/\s+/)
      .map((t) => t.replace(/[^0-9]/g, ''))
      .filter(Boolean);

    for (const expected of expectedList) {
      const expectedStr = String(expected);
      const monthlyStr = String(Math.round(expected / 12));
      if (rawDigitsTokens.includes(expectedStr) || rawDigitsTokens.includes(monthlyStr)) {
        return { outcome: 'matched' };
      }
    }

    return { outcome: 'inconclusive' };
  }

  // Core matching: check direct, 10x/1/10 scaling, and monthly( *12 ) relations
  for (const candidate of numericCandidates) {
    for (const expected of expectedList) {
      const tolerance = Math.max(200, Math.round(expected * 0.05));

      // direct match within tolerance
      if (Math.abs(candidate - expected) <= tolerance) {
        return { outcome: 'matched' };
      }

      // one-zero scale issues (OCR dropped/added a zero)
      if (Math.abs(candidate * 10 - expected) <= tolerance || Math.abs(candidate - expected * 10) <= tolerance) {
        return { outcome: 'matched' };
      }

      // monthly vs annual: candidate may be monthly while expected is annual or vice versa
      if (Math.abs(candidate * 12 - expected) <= tolerance || Math.abs(candidate - Math.round(expected / 12)) <= tolerance) {
        return { outcome: 'matched' };
      }
    }
  }

  // If no match, detect possible conflicting amounts but be more permissive
  const hasConflictingAmount = numericCandidates.some((candidate) =>
    expectedList.some((expected) => {
      const tolerance = Math.max(200, Math.round(expected * 0.05));
      const ratio = candidate / expected;
      return ratio >= 0.3 && ratio <= 3 && Math.abs(candidate - expected) > tolerance;
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
    const normalizedDocumentType = normalizeText(documentType);
    const isSalarySlip = normalizedDocumentType.includes('salaryslip');
    const isBankStatement = normalizedDocumentType.includes('bankstatement');
    const shouldRelaxNameCheck = isBankStatement; // only relax for bank statements
    const applicantName = String(userDetails?.name || '');
    const monthlyIncome = toPositiveNumber(userDetails?.monthlyIncome || userDetails?.income);
    const annualIncome = toPositiveNumber(userDetails?.annualIncome) || (monthlyIncome ? monthlyIncome * 12 : 0);
    const issues = [];

    if (!cleanedText || cleanedText.length < 30) {
      issues.push('Very little readable content. OCR text is insufficient.');
    }

    if (!isSalarySlip && hasWatermarkSignals(cleanedText)) {
      issues.push('Possible watermark inconsistency detected in OCR text.');
    }

    if (!isSalarySlip && detectSuspiciousLayout(cleanedText)) {
      issues.push('Font/layout irregularity detected by text pattern check.');
    }

    const nameValidation = verifyNameMatch(applicantName, cleanedText);
    if (!nameValidation.isMatch && !shouldRelaxNameCheck) {
      issues.push(nameValidation.reason);
    }

    let incomeCheck = 'not_applicable';
    if (isSalarySlip) {
      if (!annualIncome) {
        incomeCheck = 'inconclusive';
        issues.push('Annual income is missing in provided application details.');
      } else {
        const incomeEvaluation = evaluateSalaryIncomeMatch({
          text: cleanedText,
          expectedValues: [annualIncome],
        });

        incomeCheck = incomeEvaluation.outcome;
        // For salary slips, treat anything other than a definitive 'matched' as an issue
        if (incomeEvaluation.outcome !== 'matched') {
          issues.push('Annual income extracted from salary slip does not match provided details.');
        }
      }
      // For salary slips, also require name match; if name didn't match, add issue
      if (!nameValidation.isMatch) {
        issues.push(nameValidation.reason);
      }
    }

    const criticalIssue = issues.some((issue) =>
      issue.includes('does not match')
      || issue.includes('Income mismatch')
      || issue.includes('insufficient')
    );

    // For salary slips: require BOTH name match and income matched to be Original
    const salarySlipOnlyCheck = isSalarySlip ? (nameValidation.isMatch && incomeCheck === 'matched') : true;
    const status = (criticalIssue && !salarySlipOnlyCheck) || issues.length >= 3 ? 'Tampered' : 'Original';
    return res.status(200).json({
      status,
      message: status === 'Original' ? 'Document passed AI checks.' : issues.join(' '),
      checks: {
        name: shouldRelaxNameCheck ? true : nameValidation.isMatch,
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});