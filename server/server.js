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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});