#!/usr/bin/env node

const GitHubIntegration = require('./github-integration');

// For Node.js compatibility - use node-fetch if available, otherwise assume global fetch
let fetch;
try {
    fetch = require('node-fetch');
} catch (e) {
    // Assume global fetch is available (modern Node.js or browser environment)
    fetch = global.fetch || globalThis.fetch;
}

class GitHubCodeProvider {
    constructor() {
        this.github = new GitHubIntegration();
        this.cacheEnabled = true;
        this.prFilesCache = new Map(); // Cache PR files to avoid repeated API calls
    }

    /**
     * Check if a discussion has GitHub source information
     */
    hasGitHubSource(discussion) {
        return discussion.source && 
               discussion.source.owner && 
               discussion.source.repo && 
               discussion.source.pr;
    }

    /**
     * Extract repository information from discussion
     */
    getRepoInfo(discussion) {
        if (!this.hasGitHubSource(discussion)) {
            return null;
        }

        return {
            owner: discussion.source.owner,
            repo: discussion.source.repo,
            pullNumber: discussion.source.pr
        };
    }

    /**
     * Get or fetch PR files with caching
     */
    async getPRFiles(owner, repo, pullNumber) {
        const cacheKey = `${owner}/${repo}#${pullNumber}`;
        
        if (this.cacheEnabled && this.prFilesCache.has(cacheKey)) {
            console.log(`📄 Using cached PR files for ${cacheKey}`);
            return this.prFilesCache.get(cacheKey);
        }

        console.log(`📡 Fetching PR files for ${cacheKey}...`);
        const prFiles = await this.github.fetchPRFiles(owner, repo, pullNumber);
        
        if (this.cacheEnabled) {
            this.prFilesCache.set(cacheKey, prFiles);
        }

        return prFiles;
    }

    /**
     * Get code context for a discussion from GitHub PR diff
     */
    async getCodeContext(discussion) {
        try {
            const repoInfo = this.getRepoInfo(discussion);
            if (!repoInfo) {
                throw new Error('Discussion missing GitHub repository information');
            }

            const fileName = discussion.file;
            const lineNumber = discussion.lines[0]; // Use first line number
            
            console.log(`🔍 Getting code context for ${fileName}:${lineNumber} from ${repoInfo.owner}/${repoInfo.repo}#${repoInfo.pullNumber}`);

            // Get the code context using GitHub integration
            const context = await this.github.getCodeContextForReview(
                repoInfo.owner,
                repoInfo.repo,
                repoInfo.pullNumber,
                fileName,
                lineNumber
            );

            if (!context.codeContext) {
                throw new Error(`Could not extract code context for ${fileName}:${lineNumber}`);
            }

            return {
                fileName: context.fileName,
                lineNumber: context.lineNumber,
                codeContext: context.codeContext,
                fileInfo: context.fileInfo,
                source: 'github-pr-diff',
                repoInfo: repoInfo
            };

        } catch (error) {
            throw new Error(`Failed to get GitHub code context: ${error.message}`);
        }
    }

    /**
     * Extract code lines from the code context
     */
    extractCodeLines(codeContext, startLine, endLine) {
        const lines = codeContext.split('\n');
        
        // For GitHub diff context, we typically already have the relevant lines
        // So we just return them as-is with some basic validation
        const extractedCode = lines.join('\n');
        
        return {
            extractedCode: extractedCode,
            allLines: lines,
            startIndex: 0,
            endIndex: lines.length,
            lineCount: lines.length,
            source: 'github-diff'
        };
    }

    /**
     * Check if we can provide code context for this discussion
     */
    canProvideContext(discussion) {
        return this.hasGitHubSource(discussion);
    }

    /**
     * Get file status information
     */
    async getFileStatus(discussion) {
        try {
            const repoInfo = this.getRepoInfo(discussion);
            if (!repoInfo) {
                return { exists: false, source: 'unknown' };
            }

            const prFiles = await this.getPRFiles(repoInfo.owner, repoInfo.repo, repoInfo.pullNumber);
            const fileName = discussion.file;
            
            // Check both full path and basename
            const fileInfo = prFiles[fileName] || prFiles[discussion.source.fullPath];
            
            return {
                exists: !!fileInfo,
                source: 'github-pr',
                status: fileInfo ? fileInfo.status : undefined,
                changes: fileInfo ? fileInfo.changes : undefined,
                additions: fileInfo ? fileInfo.additions : undefined,
                deletions: fileInfo ? fileInfo.deletions : undefined
            };

        } catch (error) {
            console.warn(`Could not get file status: ${error.message}`);
            return { exists: false, source: 'error', error: error.message };
        }
    }

    /**
     * List all files in the PR
     */
    async listPRFiles(discussion) {
        try {
            const repoInfo = this.getRepoInfo(discussion);
            if (!repoInfo) {
                return [];
            }

            const prFiles = await this.getPRFiles(repoInfo.owner, repoInfo.repo, repoInfo.pullNumber);
            return Object.keys(prFiles);

        } catch (error) {
            console.warn(`Could not list PR files: ${error.message}`);
            return [];
        }
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.prFilesCache.clear();
        console.log('📄 GitHub PR files cache cleared');
    }

    /**
     * Get cache stats
     */
    getCacheStats() {
        return {
            size: this.prFilesCache.size,
            keys: Array.from(this.prFilesCache.keys())
        };
    }
}

module.exports = GitHubCodeProvider; 