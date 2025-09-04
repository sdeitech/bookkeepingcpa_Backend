const http = require('http');
const https = require('https');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const validator = require('express-joi-validation').createValidator({
    passError: true,
    statusCode: 400
});
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, `.env.${process.env.NODE_ENV}`) });

const app = express();

// ✅ CORS setup — allow all origins, support cookies
app.use(cors({
    origin: true,         // Reflects origin in Access-Control-Allow-Origin
    credentials: true     // Allows cookies/auth headers
}));

// ✅ Headers middleware — handle preflight and credentials
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*"); // required for dynamic origins
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");

    // Handle OPTIONS preflight requests quickly
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }

    next();
});

// ✅ Don't apply body parsers globally - let routes handle their own parsing
// This allows the webhook route to receive raw body for signature verification

console.log("NODE_ENV:", process.env.NODE_ENV);

// ✅ API routes - each route module will handle its own body parsing
require('./api/routes')(app, validator, bodyParser);

// ✅ Connect DB
const connectDB = require('./api/lib/db');
connectDB();

// ✅ Joi validation error handler
app.use((err, req, res, next) => {
    if (err && err.error && err.error.isJoi) {
        return res.status(400).json({ success: false, message: err.error.message, data: null });
    }
    next();
});

// ✅ Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        success: true, 
        message: 'Plurify Backend API is running',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });
});

// ✅ 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        data: null
    });
});

// ✅ Start server: HTTPS in staging, HTTP otherwise
const server = process.env.NODE_ENV === "staging"
    ? https.createServer(
        {
            key: fs.readFileSync("/path/to/ssl/privkey.pem"),
            cert: fs.readFileSync("/path/to/ssl/fullchain.pem")
        },
        app
    )
    : http.createServer(app);

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
    console.log(`✅ Plurify Backend listening on ${process.env.NODE_ENV === 'staging' ? 'HTTPS' : 'HTTP'} port ${PORT}`);
    console.log(`✅ Environment: ${process.env.NODE_ENV}`);
    console.log(`✅ Database: ${process.env.MONGO_URI}`);
});