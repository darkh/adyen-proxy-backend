const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if the origin matches any allowed origins
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      // Exact match
      if (origin === allowedOrigin.trim()) return true;
      
      // Allow subdirectories of GitHub Pages
      if (allowedOrigin.includes('github.io') && origin.startsWith(allowedOrigin.trim())) return true;
      
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
      console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['none'],
    environment: process.env.NODE_ENV || 'development'
  });
});

// Adyen session creation endpoint
app.post('/api/adyen/sessions', async (req, res) => {
  console.log('=== Session Creation Request ===');
  console.log('Origin:', req.headers.origin);
  console.log('User-Agent:', req.headers['user-agent']);
  console.log('Request body:', req.body);
  
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
      returnUrl: returnUrl || 'https://your-company.example.com/checkout',
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

app.listen(PORT, () => {
  console.log(`🚀 Adyen Proxy Server running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/health`);
  console.log(`💳 Adyen endpoint: http://localhost:${PORT}/api/adyen/sessions`);
  console.log(`🔑 Using merchant account: ${process.env.ADYEN_MERCHANT_ACCOUNT}`);
});
