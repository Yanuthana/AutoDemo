#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const inquirer = require('inquirer');
require('dotenv').config();

class AICodeResolver {
    constructor() {
        this.appFilePath = 'app.js';
        this.discussionsFilePath = 'discussions.json';
        this.openaiApiKey = process.env.OPENAI_API_KEY;
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    validateEnvironment() {
        if (!this.openaiApiKey) {
            throw new Error('OPENAI_API_KEY not found in .env file. Please add your OpenAI API key.');
        }

        if (!fs.existsSync(this.appFilePath)) {
            throw new Error(`Code file ${this.appFilePath} not found.`);
        }

        if (!fs.existsSync(this.discussionsFilePath)) {
            throw new Error(`Discussions file ${this.discussionsFilePath} not found.`);
        }
    }

    readFile(filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error.message}`);
        }
    }

    writeFile(filePath, content) {
        try {
            fs.writeFileSync(filePath, content, 'utf8');
            return true;
        } catch (error) {
            throw new Error(`Failed to write file ${filePath}: ${error.message}`);
        }
    }

    parseDiscussions() {
        try {
            const content = this.readFile(this.discussionsFilePath);
            return JSON.parse(content);
        } catch (error) {
            throw new Error(`Failed to parse discussions.json: ${error.message}`);
        }
    }

    extractCodeLines(content, startLine, endLine) {
        const lines = content.split('\n');
        
        // Convert to 0-based indexing
        const start = Math.max(0, startLine - 1);
        const end = Math.min(lines.length, endLine);
        
        return {
            extractedCode: lines.slice(start, end).join('\n'),
            allLines: lines,
            startIndex: start,
            endIndex: end
        };
    }

    createOpenAIPrompt(comment, code) {
        return `You are helping improve code based on a review comment.

Here is the review comment:
"${comment}"

Here is the original code:
${code}

Please provide a revised version of the code that fixes the issue. Return only the corrected code without any explanations or markdown formatting.`;
    }

    async callOpenAI(prompt) {
        try {
            this.log('Sending request to OpenAI...');
            
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.1
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            return response.data.choices[0].message.content.trim();
        } catch (error) {
            if (error.response) {
                const errorMessage = error.response.data && error.response.data.error && error.response.data.error.message 
                    ? error.response.data.error.message 
                    : 'Unknown error';
                throw new Error(`OpenAI API error: ${error.response.status} - ${errorMessage}`);
            } else if (error.code === 'ECONNABORTED') {
                throw new Error('OpenAI API request timed out');
            } else {
                throw new Error(`Failed to call OpenAI API: ${error.message}`);
            }
        }
    }

    async getUserApproval(originalCode, suggestedFix) {
        console.log('\n' + '='.repeat(60));
        console.log('📝 ORIGINAL CODE:');
        console.log('='.repeat(60));
        console.log(originalCode);
        
        console.log('\n' + '='.repeat(60));
        console.log('🤖 SUGGESTED FIX:');
        console.log('='.repeat(60));
        console.log(suggestedFix);
        console.log('='.repeat(60));

        const answer = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'accept',
                message: 'Do you want to apply this fix?',
                default: false
            }
        ]);

        return answer.accept;
    }

    applyFix(originalContent, suggestedFix, startIndex, endIndex) {
        const lines = originalContent.split('\n');
        const suggestedLines = suggestedFix.split('\n');
        
        // Replace the lines with the suggested fix
        const newLines = [
            ...lines.slice(0, startIndex),
            ...suggestedLines,
            ...lines.slice(endIndex)
        ];

        return newLines.join('\n');
    }

    async processDiscussion(discussion) {
        this.log(`Processing discussion: ${discussion.comment}`);
        
        const appContent = this.readFile(this.appFilePath);
        const [startLine, endLine] = discussion.lines;
        
        const { extractedCode, allLines } = this.extractCodeLines(appContent, startLine, endLine);
        
        this.log(`Extracted code from lines ${startLine}-${endLine}`);
        
        const prompt = this.createOpenAIPrompt(discussion.comment, extractedCode);
        const suggestedFix = await this.callOpenAI(prompt);
        
        this.log('Received suggestion from OpenAI', 'success');
        
        const userAccepted = await this.getUserApproval(extractedCode, suggestedFix);
        
        if (userAccepted) {
            const updatedContent = this.applyFix(
                appContent, 
                suggestedFix, 
                startLine - 1, 
                endLine
            );
            
            this.writeFile(this.appFilePath, updatedContent);
            this.log(`Applied fix to ${this.appFilePath}`, 'success');
            return true;
        } else {
            this.log('Fix rejected by user');
            return false;
        }
    }

    async run() {
        try {
            this.log('🚀 Starting AI Code Resolver...');
            
            this.validateEnvironment();
            this.log('Environment validation passed', 'success');
            
            const discussions = this.parseDiscussions();
            this.log(`Found ${discussions.length} discussion(s) to process`);
            
            for (const discussion of discussions) {
                console.log('\n' + '─'.repeat(80));
                const applied = await this.processDiscussion(discussion);
                
                if (applied) {
                    this.log(`Discussion ${discussion.id} resolved successfully`, 'success');
                } else {
                    this.log(`Discussion ${discussion.id} was not applied`);
                }
            }
            
            this.log('🎉 All discussions processed!', 'success');
            
        } catch (error) {
            this.log(`Error: ${error.message}`, 'error');
            process.exit(1);
        }
    }
}

// Run the tool
if (require.main === module) {
    const resolver = new AICodeResolver();
    resolver.run();
}

module.exports = AICodeResolver; 