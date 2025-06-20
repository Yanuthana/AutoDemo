#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const inquirer = require('inquirer');
const { diffLines } = require('diff');
require('dotenv').config();

class EnhancedAICodeResolver {
    constructor() {
        this.discussionsFilePath = 'discussions.json';
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        this.processedCount = 0;
        this.appliedCount = 0;
        this.skippedCount = 0;
        this.resolvedDiscussionIds = []; // Track which discussions were resolved
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    validateEnvironment() {
        if (!this.openaiApiKey) {
            throw new Error('OPENAI_API_KEY not found in .env file. Please add your OpenAI API key.');
        }

        if (!fs.existsSync(this.discussionsFilePath)) {
            throw new Error(`Discussions file ${this.discussionsFilePath} not found.`);
        }

        this.log('Environment validation passed', 'success');
    }

    readFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File ${filePath} not found in current directory`);
            }
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
            const discussions = JSON.parse(content);
            
            if (!Array.isArray(discussions)) {
                throw new Error('Discussions must be an array');
            }
            
            // Validate each discussion
            discussions.forEach((discussion, index) => {
                if (!discussion.id || !discussion.comment || !discussion.lines) {
                    throw new Error(`Discussion at index ${index} is missing required fields (id, comment, lines)`);
                }
                if (!Array.isArray(discussion.lines) || discussion.lines.length === 0) {
                    throw new Error(`Discussion ${discussion.id} has invalid lines array`);
                }
                // File field is required now - if missing, try to default to app.js with warning
                if (!discussion.file) {
                    this.log(`Discussion ${discussion.id} missing file field, defaulting to app.js`, 'warning');
                    discussion.file = 'app.js';
                }
            });
            
            return discussions;
        } catch (error) {
            throw new Error(`Failed to parse discussions.json: ${error.message}`);
        }
    }

    /**
     * Remove resolved discussions from discussions.json
     * This updates the file to only contain unresolved discussions
     */
    updateDiscussionsFile(discussions) {
        try {
            // Filter out resolved discussions
            const unresolvedDiscussions = discussions.filter(
                discussion => !this.resolvedDiscussionIds.includes(discussion.id)
            );
            
            // Write back to file with proper formatting
            const jsonContent = JSON.stringify(unresolvedDiscussions, null, 2);
            this.writeFile(this.discussionsFilePath, jsonContent);
            
            this.log(`Updated ${this.discussionsFilePath} - removed ${this.resolvedDiscussionIds.length} resolved discussion(s)`, 'success');
            
            return unresolvedDiscussions;
        } catch (error) {
            this.log(`Failed to update discussions file: ${error.message}`, 'error');
            throw error;
        }
    }

    extractCodeLines(content, startLine, endLine) {
        const lines = content.split('\n');
        
        // Convert to 0-based indexing and validate bounds
        const start = Math.max(0, startLine - 1);
        const end = Math.min(lines.length, endLine);
        
        if (start >= lines.length) {
            throw new Error(`Start line ${startLine} is beyond file length (${lines.length} lines)`);
        }
        
        return {
            extractedCode: lines.slice(start, end).join('\n'),
            allLines: lines,
            startIndex: start,
            endIndex: end,
            lineCount: end - start
        };
    }

    createEnhancedOpenAIPrompt(discussion, extractedCode, fileName) {
        const [startLine, endLine] = discussion.lines.length === 1 
            ? [discussion.lines[0], discussion.lines[0]] 
            : [Math.min(...discussion.lines), Math.max(...discussion.lines)];

        // Determine file type for better context
        const fileExtension = path.extname(fileName);
        let fileType = 'code';
        if (fileExtension === '.js') fileType = 'JavaScript';
        else if (fileExtension === '.html') fileType = 'HTML';
        else if (fileExtension === '.css') fileType = 'CSS';
        else if (fileExtension === '.py') fileType = 'Python';
        else if (fileExtension === '.java') fileType = 'Java';

        return `You are helping improve ${fileType} code based on code review feedback.

File: ${fileName}
Lines: ${startLine}${endLine !== startLine ? `-${endLine}` : ''}
Comment: "${discussion.comment}"

Original Code:
${extractedCode}

Please suggest an improved version that addresses the review comment. 
Return ONLY the corrected code without any explanations, markdown formatting, or code blocks.
Maintain the same indentation and formatting style as the original code.`;
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
                    max_tokens: 800,
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

    displayDiff(originalCode, suggestedCode) {
        console.log('\n' + '═'.repeat(80));
        console.log('📊 CODE COMPARISON');
        console.log('═'.repeat(80));
        
        const diff = diffLines(originalCode, suggestedCode);
        
        diff.forEach((part) => {
            // Green for additions, red for deletions, white for common parts
            const color = part.added ? '\x1b[32m' : part.removed ? '\x1b[31m' : '\x1b[37m';
            const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
            const reset = '\x1b[0m';
            
            if (part.value.trim()) {
                part.value.split('\n').forEach((line, index) => {
                    if (line.length > 0 || index < part.value.split('\n').length - 1) {
                        console.log(`${color}${prefix}${line}${reset}`);
                    }
                });
            }
        });
        
        console.log('═'.repeat(80));
        console.log('Legend: \x1b[32m+ Added\x1b[0m | \x1b[31m- Removed\x1b[0m | \x1b[37m  Unchanged\x1b[0m');
        console.log('═'.repeat(80));
    }

    async getUserApproval(discussion, originalCode, suggestedCode, fileName) {
        console.log('\n' + '🔍 REVIEW DISCUSSION #' + discussion.id);
        console.log('─'.repeat(50));
        console.log(`💬 Comment: "${discussion.comment}"`);
        console.log(`📍 Lines: ${discussion.lines.join(', ')}`);
        console.log(`📄 File: ${fileName}`);
        
        this.displayDiff(originalCode, suggestedCode);
        
        console.log('\n💡 Take your time to review the changes above...');
        
        // Remove any timeout - wait indefinitely for user input
        const answer = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'accept',
                message: '🤖 Do you want to apply this AI-suggested fix?',
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

    async processDiscussion(discussion, discussionIndex, totalDiscussions) {
        try {
            const fileName = discussion.file || 'app.js';
            
            this.log(`Processing discussion ${discussionIndex + 1}/${totalDiscussions}: "${discussion.comment}" in ${fileName}`);
            
            // Check if the target file exists
            if (!fs.existsSync(fileName)) {
                this.log(`⚠️ Target file ${fileName} not found, skipping discussion #${discussion.id}`, 'warning');
                this.skippedCount++;
                return false;
            }
            
            const fileContent = this.readFile(fileName);
            const [startLine, endLine] = discussion.lines.length === 1 
                ? [discussion.lines[0], discussion.lines[0] + 1] 
                : [Math.min(...discussion.lines), Math.max(...discussion.lines) + 1];
            
            const { extractedCode } = this.extractCodeLines(fileContent, startLine, endLine);
            
            this.log(`Extracted ${endLine - startLine} line(s) from ${fileName}`);
            
            const prompt = this.createEnhancedOpenAIPrompt(discussion, extractedCode, fileName);
            const suggestedFix = await this.callOpenAI(prompt);
            
            this.log('Received suggestion from OpenAI', 'success');
            
            const userAccepted = await this.getUserApproval(discussion, extractedCode, suggestedFix, fileName);
            
            if (userAccepted) {
                const updatedContent = this.applyFix(
                    fileContent, 
                    suggestedFix, 
                    startLine - 1, 
                    endLine - 1
                );
                
                this.writeFile(fileName, updatedContent);
                this.log(`✅ Applied fix for discussion #${discussion.id} to ${fileName}`, 'success');
                
                // Mark this discussion as resolved for removal from discussions.json
                this.resolvedDiscussionIds.push(discussion.id);
                this.appliedCount++;
                return true;
            } else {
                this.log(`⏭️  Skipped discussion #${discussion.id}`, 'warning');
                this.skippedCount++;
                return false;
            }
        } catch (error) {
            this.log(`❌ Error processing discussion #${discussion.id}: ${error.message}`, 'error');
            this.skippedCount++;
            return false;
        }
    }

    displaySummary() {
        console.log('\n' + '🎯 PROCESSING SUMMARY');
        console.log('═'.repeat(50));
        console.log(`📊 Total Discussions: ${this.processedCount}`);
        console.log(`✅ Applied Fixes: ${this.appliedCount}`);
        console.log(`⏭️  Skipped: ${this.skippedCount}`);
        console.log(`📈 Success Rate: ${this.processedCount > 0 ? Math.round((this.appliedCount / this.processedCount) * 100) : 0}%`);
        console.log('═'.repeat(50));
        
        if (this.appliedCount > 0) {
            console.log(`🎉 ${this.appliedCount} fix(es) applied to various files!`);
            console.log(`🗑️  ${this.resolvedDiscussionIds.length} resolved discussion(s) removed from ${this.discussionsFilePath}`);
        } else {
            console.log(`📝 No changes made to any files`);
        }
        
        if (this.resolvedDiscussionIds.length > 0) {
            console.log(`📋 Resolved discussions: ${this.resolvedDiscussionIds.join(', ')}`);
        }
    }

    async run() {
        try {
            this.log('🚀 Starting Enhanced AI Code Resolver...');
            console.log('═'.repeat(80));
            console.log('🤖 AI-POWERED CODE REVIEW ASSISTANT');
            console.log('═'.repeat(80));
            
            this.validateEnvironment();
            
            const discussions = this.parseDiscussions();
            this.processedCount = discussions.length;
            
            this.log(`Found ${discussions.length} discussion(s) to process`);
            
            if (discussions.length === 0) {
                this.log('No discussions found. Nothing to process.', 'warning');
                process.exit(0);
            }

            // Process each discussion sequentially
            for (let i = 0; i < discussions.length; i++) {
                const discussion = discussions[i];
                console.log('\n' + '─'.repeat(80));
                
                await this.processDiscussion(discussion, i, discussions.length);
                
                // Add a small delay between discussions for better UX
                if (i < discussions.length - 1) {
                    console.log('\n⏳ Preparing next discussion...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            // Update discussions.json to remove resolved discussions
            if (this.resolvedDiscussionIds.length > 0) {
                console.log('\n📝 Updating discussions.json to remove resolved items...');
                this.updateDiscussionsFile(discussions);
            }
            
            this.displaySummary();
            
            // Ensure the script exits cleanly
            this.log('🏁 All discussions processed. Exiting...', 'success');
            process.exit(0);
            
        } catch (error) {
            this.log(`Fatal error: ${error.message}`, 'error');
            console.log('\n💡 Troubleshooting tips:');
            console.log('  • Ensure .env file exists with valid OPENAI_API_KEY');
            console.log('  • Check that app.js and discussions.json exist');
            console.log('  • Verify discussions.json has valid JSON format');
            console.log('  • Make sure line numbers in discussions.json are within file bounds');
            process.exit(1);
        }
    }
}

// Run the enhanced tool
if (require.main === module) {
    // Ensure the script only runs once
    let isRunning = false;
    
    if (!isRunning) {
        isRunning = true;
        const resolver = new EnhancedAICodeResolver();
        resolver.run().then(() => {
            // Extra safety - force exit after completion
            setTimeout(() => {
                process.exit(0);
            }, 500);
        }).catch((error) => {
            console.error('❌ Unexpected error:', error.message);
            process.exit(1);
        });
    }
}

module.exports = EnhancedAICodeResolver; 