#!/usr/bin/env node

const { Octokit } = require('@octokit/rest');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

class GitHubIntegration {
    constructor() {
        this.token = process.env.GITHUB_TOKEN;
        this.octokit = null;
        this.discussionsFilePath = 'discussions.json';
        
        if (this.token) {
            this.octokit = new Octokit({
                auth: this.token,
            });
        }
    }

    /**
     * Validate GitHub token (only token is required now)
     */
    validateToken() {
        if (!this.token) {
            throw new Error('GITHUB_TOKEN not found in .env file. Please add your GitHub Personal Access Token.');
        }
        return true;
    }

    /**
     * Validate repository format
     */
    validateRepoFormat(repoString) {
        if (!repoString || typeof repoString !== 'string') {
            throw new Error('Repository is required');
        }
        
        const parts = repoString.trim().split('/');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            throw new Error('Repository format must be "owner/repo" (e.g., "microsoft/vscode")');
        }
        
        return true;
    }

    /**
     * Validate pull request number
     */
    validatePullNumber(pullNumber) {
        if (!pullNumber) {
            return null; // Optional field
        }
        
        const num = parseInt(pullNumber);
        if (isNaN(num) || num <= 0) {
            throw new Error('Pull request number must be a positive integer');
        }
        
        return num;
    }

    /**
     * Parse repository string into owner and repo
     */
    parseRepo(repoString) {
        this.validateRepoFormat(repoString);
        const parts = repoString.split('/');
        return {
            owner: parts[0],
            repo: parts[1]
        };
    }

    /**
     * Fetch PR file diffs - NEW METHOD
     */
    async fetchPRFiles(owner, repo, pullNumber) {
        try {
            console.log(`📁 Fetching file diffs for PR #${pullNumber} in ${owner}/${repo}...`);
            
            const { data: files } = await this.octokit.rest.pulls.listFiles({
                owner,
                repo,
                pull_number: pullNumber,
            });

            console.log(`✅ Found ${files.length} changed file(s) in PR #${pullNumber}`);
            
            // Process each file to extract useful information
            const processedFiles = {};
            for (const file of files) {
                processedFiles[file.filename] = {
                    filename: file.filename,
                    status: file.status, // 'added', 'modified', 'removed'
                    additions: file.additions,
                    deletions: file.deletions,
                    changes: file.changes,
                    patch: file.patch, // The diff content
                    rawUrl: file.raw_url, // URL to fetch full file content
                    blobUrl: file.blob_url,
                    contentsUrl: file.contents_url
                };
            }

            return processedFiles;
        } catch (error) {
            if (error.status === 404) {
                throw new Error(`Pull request #${pullNumber} not found in ${owner}/${repo}`);
            } else if (error.status === 403) {
                throw new Error('Access forbidden. Check your GitHub token permissions.');
            }
            throw new Error(`GitHub API error fetching PR files: ${error.message}`);
        }
    }

    /**
     * Extract code context from a patch diff for a specific line
     */
    extractCodeFromPatch(patch, targetLine, contextLines = 2) {
        if (!patch) {
            return null;
        }

        const lines = patch.split('\n');
        let currentOldLine = 0;
        let currentNewLine = 0;
        let targetFound = false;
        let extractedLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Parse diff header (@@)
            if (line.startsWith('@@')) {
                const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
                if (match) {
                    currentOldLine = parseInt(match[1]);
                    currentNewLine = parseInt(match[2]);
                }
                continue;
            }

            // Skip file headers
            if (line.startsWith('---') || line.startsWith('+++')) {
                continue;
            }

            const lineType = line.charAt(0);
            const content = line.substring(1);

            // Track line numbers
            if (lineType === '-') {
                currentOldLine++;
            } else if (lineType === '+') {
                currentNewLine++;
            } else {
                currentOldLine++;
                currentNewLine++;
            }

            // Check if this is the target line (considering both old and new line numbers)
            if (currentNewLine === targetLine || currentOldLine === targetLine) {
                targetFound = true;
                
                // Collect focused context around the target line
                const startIdx = Math.max(0, i - contextLines);
                const endIdx = Math.min(lines.length, i + contextLines + 1);
                
                for (let j = startIdx; j < endIdx; j++) {
                    const contextLine = lines[j];
                    if (!contextLine.startsWith('@@') && !contextLine.startsWith('---') && !contextLine.startsWith('+++')) {
                        extractedLines.push(contextLine);
                    }
                }
                break;
            }
        }

        return targetFound ? extractedLines.join('\n') : null;
    }

    /**
     * Fetch full file content from GitHub (fallback for more context)
     */
    async fetchFileContent(rawUrl) {
        try {
            const response = await fetch(rawUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch file content: ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            console.warn(`Could not fetch full file content: ${error.message}`);
            return null;
        }
    }

    /**
     * Get code context for a review comment using PR files
     */
    async getCodeContextForReview(owner, repo, pullNumber, fileName, lineNumber) {
        try {
            // Get PR files
            const prFiles = await this.fetchPRFiles(owner, repo, pullNumber);
            
            // Find the target file - try multiple approaches
            let targetFile = null;
            
            // First try exact filename match
            if (prFiles[fileName]) {
                targetFile = prFiles[fileName];
            }
            
            // If not found, try basename matching
            if (!targetFile) {
                const fileBasename = path.basename(fileName);
                for (const [fullPath, fileInfo] of Object.entries(prFiles)) {
                    if (path.basename(fullPath) === fileBasename) {
                        targetFile = fileInfo;
                        break;
                    }
                }
            }
            
            // If still not found, try pattern matching
            if (!targetFile) {
                for (const [fullPath, fileInfo] of Object.entries(prFiles)) {
                    if (fullPath.includes(fileName) || fileName.includes(path.basename(fullPath))) {
                        targetFile = fileInfo;
                        break;
                    }
                }
            }
            
            if (!targetFile) {
                console.log('📁 Available files in PR:');
                Object.keys(prFiles).forEach(file => console.log(`  - ${file}`));
                throw new Error(`File ${fileName} not found in PR #${pullNumber}`);
            }

            // Try to extract code from patch first (with focused context for intelligent reviews)
            let codeContext = this.extractCodeFromPatch(targetFile.patch, lineNumber, 2);
            
            if (!codeContext && targetFile.rawUrl) {
                // Fallback: fetch full file content and extract focused context around target line
                console.log(`📄 Fetching full file content for ${fileName}...`);
                const fullContent = await this.fetchFileContent(targetFile.rawUrl);
                
                if (fullContent) {
                    const lines = fullContent.split('\n');
                    // Extract focused context around the target line (2 lines before, target line, 2 lines after)
                    const start = Math.max(0, lineNumber - 3);
                    const end = Math.min(lines.length, lineNumber + 2);
                    codeContext = lines.slice(start, end).join('\n');
                }
            }

            return {
                fileName,
                lineNumber,
                codeContext,
                fileInfo: targetFile,
                source: 'github-pr-diff'
            };

        } catch (error) {
            throw new Error(`Failed to get code context: ${error.message}`);
        }
    }

    /**
     * Fetch pull request review comments and reviews (including pending check)
     */
    async fetchPullRequestComments(owner, repo, pullNumber) {
        try {
            console.log(`📡 Fetching review comments for PR #${pullNumber} in ${owner}/${repo}...`);
            
            // Get review comments (inline comments on code) - ONLY SUBMITTED
            const { data: reviewComments } = await this.octokit.rest.pulls.listReviewComments({
                owner,
                repo,
                pull_number: pullNumber,
            });

            // Get reviews (including PENDING detection)
            const { data: reviews } = await this.octokit.rest.pulls.listReviews({
                owner,
                repo,
                pull_number: pullNumber,
            });

            // Get regular issue comments on the PR
            const { data: issueComments } = await this.octokit.rest.issues.listComments({
                owner,
                repo,
                issue_number: pullNumber,
            });

            // Check for pending reviews warning
            this.checkForPendingReviews(reviews, reviewComments, pullNumber, owner, repo);

            return {
                reviewComments,
                reviews,
                issueComments
            };
        } catch (error) {
            if (error.status === 404) {
                throw new Error(`Pull request #${pullNumber} not found in ${owner}/${repo}`);
            } else if (error.status === 403) {
                throw new Error('Access forbidden. Check your GitHub token permissions.');
            }
            throw new Error(`GitHub API error: ${error.message}`);
        }
    }

    /**
     * Check for potential pending reviews and warn user
     */
    checkForPendingReviews(reviews, reviewComments, pullNumber, owner, repo) {
        const submittedReviews = reviews.filter(review => review.state !== 'PENDING');
        const pendingReviews = reviews.filter(review => review.state === 'PENDING');
        
        // If we have very few or no review comments but the user is specifically requesting this PR,
        // they likely have pending reviews
        if (reviewComments.length === 0 && submittedReviews.length === 0) {
            console.log('');
            console.log('⚠️  ' + '='.repeat(80));
            console.log('⚠️  NO REVIEW COMMENTS FOUND - PENDING REVIEWS DETECTED');
            console.log('⚠️  ' + '='.repeat(80));
            console.log('');
            console.log('🔍 Possible Reasons:');
            console.log('   1. Review comments are in PENDING/DRAFT state (not yet submitted)');
            console.log('   2. No review comments have been added to this PR yet');
            console.log('   3. Comments exist but are general PR comments (not inline code reviews)');
            console.log('');
            console.log('📝 GitHub API Limitation:');
            console.log('   • GitHub\'s API only returns SUBMITTED review comments');
            console.log('   • PENDING/DRAFT review comments are NOT accessible via API');
            console.log('   • This is a GitHub security/privacy limitation');
            console.log('');
            console.log('✅ SOLUTION - Submit Your Review:');
            console.log(`   1. Go to: https://github.com/${owner}/${repo}/pull/${pullNumber}`);
            console.log('   2. Click "Finish your review" or "Submit review"');
            console.log('   3. Choose: "Comment", "Approve", or "Request changes"');
            console.log('   4. Click "Submit review"');
            console.log('   5. Re-run this tool to fetch the now-submitted comments');
            console.log('');
            console.log('🔄 Alternative - Manual Entry:');
            console.log('   • You can manually add discussions to discussions.json');
            console.log('   • Use the existing format with file, lines, and comment fields');
            console.log('');
            console.log('⚠️  ' + '='.repeat(80));
            console.log('');
        } else if (pendingReviews.length > 0) {
            console.log('');
            console.log('⚠️  PENDING REVIEWS DETECTED');
            console.log(`   • Found ${pendingReviews.length} pending review(s) that are not accessible via API`);
            console.log('   • Submit pending reviews to make them available for processing');
            console.log('');
        }

        if (reviewComments.length > 0) {
            console.log(`✅ Found ${reviewComments.length} submitted review comment(s)`);
        }
        if (submittedReviews.length > 0) {
            console.log(`✅ Found ${submittedReviews.length} submitted review(s)`);
        }
    }

    /**
     * Fetch discussions from all open pull requests
     */
    async fetchAllOpenPullRequests(owner, repo) {
        try {
            console.log(`📡 Fetching all open pull requests in ${owner}/${repo}...`);
            
            const { data: pullRequests } = await this.octokit.rest.pulls.list({
                owner,
                repo,
                state: 'open',
                per_page: 10 // Limit to first 10 open PRs
            });

            const allComments = [];
            
            for (const pr of pullRequests) {
                console.log(`📄 Processing PR #${pr.number}: ${pr.title}`);
                const comments = await this.fetchPullRequestComments(owner, repo, pr.number);
                allComments.push({
                    prNumber: pr.number,
                    prTitle: pr.title,
                    ...comments
                });
            }

            return allComments;
        } catch (error) {
            throw new Error(`Failed to fetch pull requests: ${error.message}`);
        }
    }

    /**
     * Convert GitHub comments to discussions.json format
     */
    convertCommentsToDiscussions(commentsData, owner, repo) {
        const discussions = [];
        let discussionId = 1;

        for (const prData of commentsData) {
            const { prNumber, prTitle, reviewComments, reviews, issueComments } = prData;

            // Process review comments (inline code comments)
            for (const comment of reviewComments) {
                const fileName = path.basename(comment.path);
                const lineNumber = comment.line || comment.original_line;
                
                if (lineNumber && comment.body && comment.body.trim()) {
                    discussions.push({
                        id: discussionId++,
                        file: fileName,
                        lines: [lineNumber],
                        comment: comment.body.trim(),
                        source: {
                            type: 'review_comment',
                            pr: prNumber,
                            prTitle: prTitle,
                            author: comment.user.login,
                            path: comment.path,
                            url: comment.html_url,
                            state: 'submitted',
                            owner: owner,
                            repo: repo,
                            fullPath: comment.path // Store full path for GitHub API calls
                        }
                    });
                }
            }

            // Process review body comments (if they mention files/lines)
            for (const review of reviews) {
                if (review.body && review.body.trim() && review.state !== 'PENDING') {
                    const fileLineMentions = this.extractFileLineMentions(review.body);
                    
                    for (const mention of fileLineMentions) {
                        discussions.push({
                            id: discussionId++,
                            file: mention.file,
                            lines: mention.lines,
                            comment: review.body.trim(),
                            source: {
                                type: 'review_body',
                                pr: prNumber,
                                prTitle: prTitle,
                                author: review.user.login,
                                url: review.html_url,
                                state: review.state.toLowerCase(),
                                owner: owner,
                                repo: repo
                            }
                        });
                    }
                }
            }

            // Process general PR comments that mention files/lines
            for (const comment of issueComments) {
                const fileLineMentions = this.extractFileLineMentions(comment.body);
                
                for (const mention of fileLineMentions) {
                    discussions.push({
                        id: discussionId++,
                        file: mention.file,
                        lines: mention.lines,
                        comment: comment.body.trim(),
                        source: {
                            type: 'issue_comment',
                            pr: prNumber,
                            prTitle: prTitle,
                            author: comment.user.login,
                            url: comment.html_url,
                            state: 'submitted',
                            owner: owner,
                            repo: repo
                        }
                    });
                }
            }
        }

        return discussions;
    }

    /**
     * Extract file and line mentions from comment text
     * Looks for patterns like "app.js line 15" or "src/utils.js:42"
     */
    extractFileLineMentions(commentBody) {
        const mentions = [];
        
        // Pattern 1: "filename line N" or "filename:N"
        const pattern1 = /(\w+\.\w+)(?:\s+line\s+|:)(\d+)/gi;
        let match;
        
        while ((match = pattern1.exec(commentBody)) !== null) {
            mentions.push({
                file: match[1],
                lines: [parseInt(match[2])]
            });
        }

        // Pattern 2: "src/path/file.js line N"
        const pattern2 = /([\w\/]+\.\w+)(?:\s+line\s+|:)(\d+)/gi;
        
        while ((match = pattern2.exec(commentBody)) !== null) {
            const fileName = path.basename(match[1]);
            mentions.push({
                file: fileName,
                lines: [parseInt(match[2])]
            });
        }

        return mentions;
    }

    /**
     * Main method to fetch GitHub discussions and save to file
     * Now accepts repository and pullNumber as parameters
     */
    async fetchDiscussions(repository, pullNumber = null) {
        try {
            this.validateToken();
            
            const { owner, repo } = this.parseRepo(repository);
            let commentsData;

            if (pullNumber !== null) {
                // Validate and fetch from specific PR
                const validatedPR = this.validatePullNumber(pullNumber);
                const comments = await this.fetchPullRequestComments(owner, repo, validatedPR);
                commentsData = [{
                    prNumber: validatedPR,
                    prTitle: `PR #${validatedPR}`,
                    ...comments
                }];
            } else {
                // Fetch from all open PRs
                commentsData = await this.fetchAllOpenPullRequests(owner, repo);
            }

            const discussions = this.convertCommentsToDiscussions(commentsData, owner, repo);

            if (discussions.length === 0) {
                console.log('⚠️  No actionable GitHub review discussions found.');
                console.log('💡 This could mean:');
                console.log('   • Review comments are pending (not yet submitted)');
                console.log('   • No review comments exist on the specified PR(s)');
                console.log('   • Comments exist but don\'t mention specific files/lines');
                console.log('');
                console.log('📝 To make review comments accessible:');
                console.log('   1. Submit any pending reviews in GitHub');
                console.log('   2. Ensure comments are inline code reviews (not just PR comments)');
                console.log('   3. Or manually add discussions to discussions.json');
                
                // Create empty discussions file
                await fs.writeJSON(this.discussionsFilePath, [], { spaces: 2 });
                console.log(`📄 Created empty ${this.discussionsFilePath}`);
                return { discussions: [], message: 'No discussions found - see guidance above' };
            }

            // Save discussions to file
            await fs.writeJSON(this.discussionsFilePath, discussions, { spaces: 2 });
            
            console.log(`✅ Successfully saved ${discussions.length} discussion(s) to ${this.discussionsFilePath}`);
            console.log('📄 Discussions fetched from:');
            
            const sources = [...new Set(discussions.map(d => `PR #${d.source.pr}: ${d.source.prTitle}`))];
            sources.forEach(source => console.log(`   • ${source}`));
            
            return { discussions, message: 'Success' };
            
        } catch (error) {
            console.error('❌ Error fetching GitHub discussions:', error.message);
            throw error;
        }
    }

    /**
     * Test GitHub connection and token validity
     * Now accepts repository as parameter
     */
    async testConnection(repository) {
        try {
            this.validateToken();
            
            const { owner, repo } = this.parseRepo(repository);
            
            console.log('🔍 Testing GitHub connection...');
            
            // Test API access with repository
            const { data: repoData } = await this.octokit.rest.repos.get({
                owner,
                repo
            });
            
            console.log(`✅ Successfully connected to GitHub`);
            console.log(`📦 Repository: ${repoData.full_name}`);
            console.log(`👤 Owner: ${repoData.owner.login}`);
            console.log(`🔒 Private: ${repoData.private}`);
            
            return true;
        } catch (error) {
            if (error.status === 404) {
                throw new Error(`Repository not found or access denied: ${repository}`);
            } else if (error.status === 401) {
                throw new Error('Invalid GitHub token. Please check your GITHUB_TOKEN in .env');
            } else if (error.status === 403) {
                throw new Error('GitHub token lacks required permissions');
            }
            throw new Error(`GitHub connection failed: ${error.message}`);
        }
    }

    /**
     * Test token without repository requirement
     */
    async testTokenOnly() {
        try {
            this.validateToken();
            
            console.log('🔍 Testing GitHub token...');
            
            // Test basic API access
            const { data: user } = await this.octokit.rest.users.getAuthenticated();
            
            console.log(`✅ GitHub token is valid`);
            console.log(`👤 Authenticated as: ${user.login}`);
            console.log(`🔗 Profile: ${user.html_url}`);
            
            return true;
        } catch (error) {
            if (error.status === 401) {
                throw new Error('Invalid GitHub token. Please check your GITHUB_TOKEN in .env');
            }
            throw new Error(`GitHub token test failed: ${error.message}`);
        }
    }
}

module.exports = GitHubIntegration; 