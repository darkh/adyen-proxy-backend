const https = require('https');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.HTTPS_PORT || 3001;

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://darkh.github.io'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Adyen session creation endpoint
app.post('/api/adyen/sessions', async (req, res) => {
  try {
    const { amount, currency = 'AED', countryCode = 'AE', returnUrl } = req.body;

    if (!amount) {
      return res.status(400).json({
        error: 'Amount is required',
        code: 'MISSING_AMOUNT'
      });
    }

    // Generate unique reference
    const reference = `ref_${Date.now()}_${Math.floor(Math.random() * 999999)}`;

    const requestBody = {
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      amount: { 
        value: parseInt(amount), 
        currency: currency 
      },
      returnUrl: returnUrl || 'https://darkh.github.io/test_web/',
      reference: reference,
      countryCode: countryCode,
    };

    console.log('Creating Adyen session with:', JSON.stringify(requestBody, null, 2));

    const response = await axios.post(
      `${process.env.ADYEN_BASE_URL}/sessions`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.ADYEN_API_KEY,
        },
      }
    );

    console.log('Adyen session created successfully:', response.data.id);

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error('Error creating Adyen session:', error.response?.data || error.message);
    
    if (error.response) {
      // Adyen API error
      res.status(error.response.status).json({
        error: 'Adyen API Error',
        message: error.response.data?.message || 'Unknown API error',
        code: error.response.data?.errorCode || 'API_ERROR',
        details: error.response.data
      });
    } else {
      // Network or other error
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create payment session',
        code: 'INTERNAL_ERROR'
      });
    }
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Something went wrong',
    code: 'INTERNAL_ERROR'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    code: 'NOT_FOUND'
  });
});

// Create self-signed certificate for local HTTPS
const createSelfSignedCert = () => {
  try {
    // Check if certificates already exist
    const keyPath = path.join(__dirname, 'localhost-key.pem');
    const certPath = path.join(__dirname, 'localhost-cert.pem');
    
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
    }
    
    console.log('⚠️  HTTPS certificates not found. Please generate them using:');
    console.log('   openssl req -x509 -newkey rsa:2048 -keyout localhost-key.pem -out localhost-cert.pem -days 365 -nodes -subj "/CN=localhost"');
    return null;
  } catch (error) {
    console.error('Error reading certificates:', error);
    return null;
  }
};

// Start HTTPS server
const credentials = createSelfSignedCert();
if (credentials) {
  https.createServer(credentials, app).listen(PORT, () => {
    console.log(`🔒 HTTPS Adyen Proxy Server running on port ${PORT}`);
    console.log(`📝 Health check: https://localhost:${PORT}/health`);
    console.log(`💳 Adyen endpoint: https://localhost:${PORT}/api/adyen/sessions`);
    console.log(`🌐 Allowed origins: ${process.env.ALLOWED_ORIGINS}`);
    console.log(`🔑 Using merchant account: ${process.env.ADYEN_MERCHANT_ACCOUNT}`);
  });
} else {
  console.log('Starting HTTP server instead...');
  app.listen(PORT, () => {
    console.log(`🚀 HTTP Adyen Proxy Server running on port ${PORT}`);
    console.log(`📝 Health check: http://localhost:${PORT}/health`);
    console.log(`💳 Adyen endpoint: http://localhost:${PORT}/api/adyen/sessions`);
  });
}
