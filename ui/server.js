#!/usr/bin/env node

const express = require('express');
const path = require('path');
const fs = require('fs');

// Load environment variables from the parent directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import the existing AI resolver logic
const EnhancedAICodeResolver = require('../resolveWithAI.js');

class UIServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        
        // Create resolver instance with correct file paths (parent directory)
        this.resolver = new EnhancedAICodeResolver();
        // Override the file paths to point to the parent directory
        this.resolver.appFilePath = path.join(__dirname, '..', 'app.js');
        this.resolver.discussionsFilePath = path.join(__dirname, '..', 'discussions.json');
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Parse JSON bodies
        this.app.use(express.json());
        
        // Serve static files from the ui directory
        this.app.use(express.static(path.join(__dirname)));
        
        // Enable CORS for development
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            next();
        });
    }

    setupRoutes() {
        // Serve the main UI
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
        });

        // API endpoint to get discussions
        this.app.get('/api/discussions', async (req, res) => {
            try {
                const discussions = this.resolver.parseDiscussions();
                res.json(discussions);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // API endpoint to get AI suggestion for a discussion
        this.app.post('/api/suggest', async (req, res) => {
            try {
                const discussion = req.body;
                
                // Read the code file
                const appContent = this.resolver.readFile(this.resolver.appFilePath);
                
                // Extract the relevant code lines
                const [startLine, endLine] = discussion.lines.length === 1 
                    ? [discussion.lines[0], discussion.lines[0] + 1] 
                    : [Math.min(...discussion.lines), Math.max(...discussion.lines) + 1];
                
                const { extractedCode } = this.resolver.extractCodeLines(appContent, startLine, endLine);
                
                // Get AI suggestion
                const prompt = this.resolver.createEnhancedOpenAIPrompt(discussion, extractedCode);
                const suggestedCode = await this.resolver.callOpenAI(prompt);
                
                res.json({
                    originalCode: extractedCode,
                    suggestedCode: suggestedCode,
                    discussion: discussion
                });
                
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // API endpoint to apply a fix
        this.app.post('/api/apply-fix', async (req, res) => {
            try {
                const discussion = req.body;
                
                // Read the current file content
                const appContent = this.resolver.readFile(this.resolver.appFilePath);
                
                // Extract the code and get AI suggestion
                const [startLine, endLine] = discussion.lines.length === 1 
                    ? [discussion.lines[0], discussion.lines[0] + 1] 
                    : [Math.min(...discussion.lines), Math.max(...discussion.lines) + 1];
                
                const { extractedCode } = this.resolver.extractCodeLines(appContent, startLine, endLine);
                
                // Get the suggested fix
                const prompt = this.resolver.createEnhancedOpenAIPrompt(discussion, extractedCode);
                const suggestedFix = await this.resolver.callOpenAI(prompt);
                
                // Apply the fix to app.js
                const updatedContent = this.resolver.applyFix(
                    appContent, 
                    suggestedFix, 
                    startLine - 1, 
                    endLine - 1
                );
                
                // Write the updated content back to the app.js file
                this.resolver.writeFile(this.resolver.appFilePath, updatedContent);
                
                // IMMEDIATELY remove this discussion from discussions.json
                const currentDiscussions = this.resolver.parseDiscussions();
                const updatedDiscussions = currentDiscussions.filter(d => d.id !== discussion.id);
                const jsonContent = JSON.stringify(updatedDiscussions, null, 2);
                this.resolver.writeFile(this.resolver.discussionsFilePath, jsonContent);
                
                res.json({ 
                    success: true, 
                    message: `Fix applied for discussion #${discussion.id} and removed from discussions.json`,
                    appliedCode: suggestedFix,
                    discussionRemoved: true,
                    remainingDiscussions: updatedDiscussions.length
                });
                
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Health check endpoint
        this.app.get('/api/health', (req, res) => {
            try {
                this.resolver.validateEnvironment();
                res.json({ 
                    status: 'healthy',
                    openaiConfigured: !!process.env.OPENAI_API_KEY,
                    filesExist: {
                        appJs: fs.existsSync(this.resolver.appFilePath),
                        discussionsJson: fs.existsSync(this.resolver.discussionsFilePath)
                    }
                });
            } catch (error) {
                res.status(500).json({ 
                    status: 'unhealthy',
                    error: error.message 
                });
            }
        });

        // Catch-all handler: send back the main UI for any non-API routes
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
        });
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🚀 AI Code Resolver UI Server started`);
            console.log(`📡 Server running at: http://localhost:${this.port}`);
            console.log(`📄 Open http://localhost:${this.port} in your browser`);
            console.log(`🔧 API endpoints available at /api/*`);
            console.log('');
            
            // Validate environment on startup
            try {
                this.resolver.validateEnvironment();
                console.log('✅ Environment validation passed');
                console.log('✅ OpenAI API key configured');
                console.log('✅ Required files found');
            } catch (error) {
                console.log('❌ Environment validation failed:', error.message);
                console.log('💡 Please check your .env file and ensure app.js and discussions.json exist');
            }
            
            console.log('\n📖 Usage:');
            console.log('  1. Open the browser and go to the URL above');
            console.log('  2. Click "Start Review Process" to begin');
            console.log('  3. Review AI suggestions and click Accept/Reject');
            console.log('  4. View the summary when complete');
            console.log('\n🛑 Press Ctrl+C to stop the server');
        });
    }
}

// Start the server if this file is run directly
if (require.main === module) {
    const server = new UIServer();
    server.start();
}

module.exports = UIServer; 