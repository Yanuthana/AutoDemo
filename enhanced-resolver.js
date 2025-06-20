#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const inquirer = require('inquirer');
const { diffLines } = require('diff');
const UndoManager = require('./undo-manager');
const GitHubCodeProvider = require('./github-code-provider');
require('dotenv').config();

class EnhancedAICodeResolver {
    constructor() {
        this.discussionsFilePath = 'discussions.json';
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        this.processedCount = 0;
        this.appliedCount = 0;
        this.skippedCount = 0;
        this.resolvedDiscussionIds = [];
        this.undoManager = new UndoManager();
        this.githubCodeProvider = new GitHubCodeProvider();
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
            throw new Error(`Discussions file ${this.discussionsFilePath} not found. Run 'fetch' command first.`);
        }

        this.log('Environment validation passed', 'success');
    }

    async readFile(filePath) {
        try {
            if (!await fs.pathExists(filePath)) {
                throw new Error(`File ${filePath} not found`);
            }
            return await fs.readFile(filePath, 'utf8');
        } catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error.message}`);
        }
    }

    async writeFile(filePath, content) {
        try {
            await fs.writeFile(filePath, content, 'utf8');
            return true;
        } catch (error) {
            throw new Error(`Failed to write file ${filePath}: ${error.message}`);
        }
    }

    async parseDiscussions() {
        try {
            const content = await this.readFile(this.discussionsFilePath);
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
                // File field is optional - default to 'app.js' for backward compatibility
                if (!discussion.file) {
                    discussion.file = 'app.js';
                }
            });
            
            return discussions;
        } catch (error) {
            throw new Error(`Failed to parse discussions.json: ${error.message}`);
        }
    }

    /**
     * Get code context for a discussion (GitHub or local)
     */
    async getCodeContext(discussion) {
        try {
            // Check if we can use GitHub code provider
            if (this.githubCodeProvider.canProvideContext(discussion)) {
                this.log(`Getting code context from GitHub PR for ${discussion.file}...`);
                return await this.githubCodeProvider.getCodeContext(discussion);
            } else {
                // Fallback to local file reading
                this.log(`Getting code context from local file ${discussion.file}...`, 'warning');
                return await this.getLocalCodeContext(discussion);
            }
        } catch (error) {
            throw new Error(`Failed to get code context: ${error.message}`);
        }
    }

    /**
     * Fallback method for local code context (backward compatibility)
     */
    async getLocalCodeContext(discussion) {
        const fileName = discussion.file || 'app.js';
        const fileContent = await this.readFile(fileName);
        const [startLine, endLine] = discussion.lines.length === 1 
            ? [discussion.lines[0], discussion.lines[0] + 1] 
            : [Math.min(...discussion.lines), Math.max(...discussion.lines) + 1];
        
        const { extractedCode } = this.extractCodeLines(fileContent, startLine, endLine);
        
        return {
            fileName,
            lineNumber: discussion.lines[0],
            codeContext: extractedCode,
            fileInfo: null,
            source: 'local-file',
            repoInfo: null
        };
    }

    /**
     * Remove resolved discussions from discussions.json
     */
    async updateDiscussionsFile(discussions) {
        try {
            // Filter out resolved discussions
            const unresolvedDiscussions = discussions.filter(
                discussion => !this.resolvedDiscussionIds.includes(discussion.id)
            );
            
            // Write back to file with proper formatting
            await fs.writeJSON(this.discussionsFilePath, unresolvedDiscussions, { spaces: 2 });
            
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
        let specificGuidance = '';
        
        if (fileExtension === '.js') {
            fileType = 'JavaScript';
            specificGuidance = 'Apply JavaScript best practices. Consider variable scoping, function design, and error handling.';
        } else if (fileExtension === '.html') {
            fileType = 'HTML';
            specificGuidance = 'Follow semantic HTML and accessibility standards. For aria-label requests, add meaningful descriptions that help screen readers. Preserve existing tag structure and attributes.';
        } else if (fileExtension === '.css') {
            fileType = 'CSS';
            specificGuidance = 'Apply CSS best practices while preserving existing selectors and important styles.';
        } else if (fileExtension === '.py') {
            fileType = 'Python';
            specificGuidance = 'Follow PEP 8 guidelines and Python best practices for readability and maintainability.';
        } else if (fileExtension === '.java') {
            fileType = 'Java';
            specificGuidance = 'Apply Java conventions and consider object-oriented design principles.';
        }

        // Clean up the extracted code - remove diff markers if present
        let cleanCode = extractedCode;
        if (cleanCode.includes('@@') || cleanCode.startsWith('+') || cleanCode.startsWith('-')) {
            // This is diff output, clean it up
            const lines = cleanCode.split('\n');
            const cleanedLines = lines
                .filter(line => !line.startsWith('@@') && !line.startsWith('---') && !line.startsWith('+++'))
                .map(line => {
                    // Remove diff markers but keep the content
                    if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
                        return line.substring(1);
                    }
                    return line;
                });
            cleanCode = cleanedLines.join('\n').trim();
        }

        // Identify the specific target line in the context
        const codeLines = cleanCode.split('\n');
        let targetLineIndex = -1;
        let targetLineContent = '';
        
        // For single line discussions, try to identify the most relevant line
        if (discussion.lines.length === 1 && codeLines.length > 1) {
            // Look for the line that contains the most relevant code
            for (let i = 0; i < codeLines.length; i++) {
                const line = codeLines[i].trim();
                if (line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*')) {
                    targetLineIndex = i;
                    targetLineContent = codeLines[i];
                    break;
                }
            }
        } else {
            targetLineIndex = 0;
            targetLineContent = codeLines[0] || cleanCode;
        }
        
        // Create an intelligent, context-aware prompt
        return `You are an expert code reviewer helping implement a specific code improvement.

**CONTEXT ANALYSIS:**
File: ${fileName} (${fileType})
Target Line: ${startLine}${endLine !== startLine ? ` to ${endLine}` : ''}
Review Comment: "${discussion.comment}"

**CODE CONTEXT:**
${cleanCode}

**FOCUS LINE:**
${targetLineContent || 'Line not clearly identified'}

**TASK:**
Analyze the reviewer's comment and apply it specifically to line ${startLine}${endLine !== startLine ? ` to ${endLine}` : ''}. 

**REQUIREMENTS:**
1. **UNDERSTAND THE INTENT**: Carefully read the comment and understand what the reviewer is asking for
2. **ANALYZE THE CODE**: Look at the target line in context to understand its purpose and structure
3. **MAKE TARGETED CHANGES**: Apply the requested change specifically to the target line(s)
4. **PRESERVE CONTEXT**: Keep all other lines exactly as they are
5. **${specificGuidance}**

**SPECIFIC GUIDANCE FOR COMMON REQUESTS:**
- "Add aria-label": Add a meaningful aria-label attribute to the HTML element that describes its purpose
- "Use const/let": Change variable declaration type only, keep everything else the same
- "Handle null input": Add null checking or default values as appropriate
- "Improve accessibility": Add appropriate ARIA attributes or semantic elements
- "Fix security issue": Address the specific security concern mentioned

**OUTPUT FORMAT:**
Return the complete code block with your changes applied. Show all the context lines but only modify the specific line(s) mentioned in the review.

**CORRECTED CODE:**`;
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
        
        // Show GitHub source information if available
        if (discussion.source) {
            console.log(`👤 Author: ${discussion.source.author}`);
            console.log(`🔗 PR: #${discussion.source.pr} - ${discussion.source.prTitle}`);
        }
        
        this.displayDiff(originalCode, suggestedCode);
        
        console.log('\n💡 Take your time to review the changes above...');
        
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
            
            // Get code context from GitHub or local file
            const codeContext = await this.getCodeContext(discussion);
            
            this.log(`Extracted code from ${codeContext.source} for ${fileName}:${codeContext.lineNumber}`);
            
            const prompt = this.createEnhancedOpenAIPrompt(discussion, codeContext.codeContext, fileName);
            const suggestedFix = await this.callOpenAI(prompt);
            
            this.log('Received suggestion from OpenAI', 'success');
            
            const userAccepted = await this.getUserApproval(discussion, codeContext.codeContext, suggestedFix, fileName);
            
            if (userAccepted) {
                // For GitHub-sourced discussions, we can't apply changes directly
                if (codeContext.source === 'github-pr-diff') {
                    this.log(`✅ Accepted AI suggestion for discussion #${discussion.id} from ${codeContext.repoInfo.owner}/${codeContext.repoInfo.repo}#${codeContext.repoInfo.pullNumber}`, 'success');
                    this.log(`📝 Note: This was from a GitHub PR. Consider applying the changes manually to the repository.`, 'warning');
                    
                    // Still mark as resolved to remove from discussions.json
                    this.resolvedDiscussionIds.push(discussion.id);
                    this.appliedCount++;
                    return true;
                } else {
                    // Local file - apply changes normally
                    const fileContent = await this.readFile(fileName);
                    const [startLine, endLine] = discussion.lines.length === 1 
                        ? [discussion.lines[0], discussion.lines[0] + 1] 
                        : [Math.min(...discussion.lines), Math.max(...discussion.lines) + 1];
                    
                    // Create backup before applying changes
                    const changeDescription = `Fix for discussion #${discussion.id}: ${discussion.comment}`;
                    await this.undoManager.createBackup(fileName, fileContent, discussion.id, changeDescription);
                    
                    const updatedContent = this.applyFix(
                        fileContent, 
                        suggestedFix, 
                        startLine - 1, 
                        endLine - 1
                    );
                    
                    await this.writeFile(fileName, updatedContent);
                    this.log(`✅ Applied fix for discussion #${discussion.id} to local file ${fileName}`, 'success');
                    
                    // Mark this discussion as resolved for removal from discussions.json
                    this.resolvedDiscussionIds.push(discussion.id);
                    this.appliedCount++;
                    return true;
                }
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
            console.log(`🎉 ${this.appliedCount} fix(es) applied to files!`);
            console.log(`🗑️  ${this.resolvedDiscussionIds.length} resolved discussion(s) will be removed from ${this.discussionsFilePath}`);
            console.log(`💾 Use 'undo' command to revert the last change if needed`);
        } else {
            console.log(`📝 No changes made to files`);
        }
        
        if (this.resolvedDiscussionIds.length > 0) {
            console.log(`📋 Resolved discussions: ${this.resolvedDiscussionIds.join(', ')}`);
        }
    }

    async run() {
        try {
            this.log('🚀 Starting Enhanced AI Code Resolver...');
            console.log('═'.repeat(80));
            console.log('🤖 AI-POWERED CODE REVIEW ASSISTANT v3.0');
            console.log('═'.repeat(80));
            
            this.validateEnvironment();
            
            const discussions = await this.parseDiscussions();
            this.processedCount = discussions.length;
            
            this.log(`Found ${discussions.length} discussion(s) to process`);
            
            if (discussions.length === 0) {
                console.log('\n📝 No discussions found to process.');
                console.log('💡 Run the "fetch" command to get discussions from GitHub');
                console.log('💡 Or add discussions manually to discussions.json');
                return;
            }

            // Show undo status
            const undoStatus = await this.undoManager.getUndoStatus();
            if (undoStatus.available) {
                console.log(`\n↩️  Undo available: ${undoStatus.changeDescription}`);
                console.log(`    Use 'undo' command to revert if needed`);
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
                await this.updateDiscussionsFile(discussions);
            }
            
            this.displaySummary();
            
            // Clean up old backups
            await this.undoManager.cleanupOldBackups();
            
            this.log('🏁 All discussions processed successfully!', 'success');
            
        } catch (error) {
            this.log(`Fatal error: ${error.message}`, 'error');
            console.log('\n💡 Troubleshooting tips:');
            console.log('  • Run "fetch" command to get discussions from GitHub');
            console.log('  • Ensure .env file exists with valid OPENAI_API_KEY and GITHUB_TOKEN');
            console.log('  • Check that the target files exist and are readable');
            console.log('  • Verify discussions.json has valid JSON format');
            process.exit(1);
        }
    }
}

module.exports = EnhancedAICodeResolver; 