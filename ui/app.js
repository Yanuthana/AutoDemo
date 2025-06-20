// AI Code Resolver UI Controller
class AICodeResolverUI {
    constructor() {
        this.currentDiscussionIndex = 0;
        this.discussions = [];
        this.processedCount = 0;
        this.appliedCount = 0;
        this.skippedCount = 0;
        this.resolvedDiscussionIds = [];
        
        this.initializeEventListeners();
        this.showWelcomeScreen();
    }

    initializeEventListeners() {
        // Start button
        document.getElementById('startBtn').addEventListener('click', () => {
            this.startReviewProcess();
        });

        // Action buttons
        document.getElementById('acceptBtn').addEventListener('click', () => {
            this.handleAccept();
        });

        document.getElementById('rejectBtn').addEventListener('click', () => {
            this.handleReject();
        });

        // Run again button
        document.getElementById('runAgainBtn').addEventListener('click', () => {
            this.restartProcess();
        });

        // Restart button
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.restartProcess();
        });
    }

    showWelcomeScreen() {
        this.hideAllViews();
        document.getElementById('welcomeScreen').style.display = 'block';
        this.updateStatus('Ready', 'ready');
    }

    showDiscussionView() {
        this.hideAllViews();
        document.getElementById('discussionView').style.display = 'block';
    }

    showSummaryView() {
        this.hideAllViews();
        document.getElementById('summaryView').style.display = 'block';
        this.updateStatus('Complete', 'complete');
        document.getElementById('runAgainBtn').disabled = false;
    }

    hideAllViews() {
        document.getElementById('welcomeScreen').style.display = 'none';
        document.getElementById('discussionView').style.display = 'none';
        document.getElementById('summaryView').style.display = 'none';
    }

    updateStatus(text, status) {
        const statusElement = document.getElementById('statusIndicator');
        const statusText = statusElement.querySelector('.status-text');
        const statusDot = statusElement.querySelector('.status-dot');
        
        statusText.textContent = text;
        
        // Update status dot color
        statusDot.className = 'status-dot';
        if (status === 'processing') {
            statusDot.style.backgroundColor = '#ffc107';
        } else if (status === 'complete') {
            statusDot.style.backgroundColor = '#28a745';
        } else {
            statusDot.style.backgroundColor = '#007acc';
        }
    }

    async startReviewProcess() {
        try {
            this.updateStatus('Loading discussions...', 'processing');
            this.showNotification('Loading discussions...', 'info');
            
            // Load discussions from the backend
            const discussions = await this.loadDiscussions();
            
            if (discussions.length === 0) {
                this.showNotification('No discussions found to process.', 'info');
                this.showWelcomeScreen();
                return;
            }

            this.discussions = discussions;
            this.processedCount = discussions.length;
            this.currentDiscussionIndex = 0;
            this.appliedCount = 0;
            this.skippedCount = 0;
            this.resolvedDiscussionIds = [];

            this.showDiscussionView();
            await this.processCurrentDiscussion();

        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
            this.updateStatus('Error', 'error');
        }
    }

    async loadDiscussions() {
        try {
            const response = await fetch('/api/discussions');
            if (!response.ok) {
                throw new Error(`Failed to load discussions: ${response.status} ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            // Do NOT fallback to dummy data - throw the error to be handled by the caller
            throw new Error(`Could not load discussions from backend: ${error.message}`);
        }
    }

    async processCurrentDiscussion() {
        const discussion = this.discussions[this.currentDiscussionIndex];
        
        this.updateProgress();
        this.updateDiscussionInfo(discussion);
        
        try {
            this.showLoadingState(true);
            this.updateStatus('Getting AI suggestion...', 'processing');
            
            // Get AI suggestion from backend
            const suggestion = await this.getAISuggestion(discussion);
            
            this.showLoadingState(false);
            this.displayCodeComparison(suggestion.originalCode, suggestion.suggestedCode);
            
            this.updateStatus('Waiting for user decision...', 'processing');
            
        } catch (error) {
            this.showLoadingState(false);
            this.showNotification(`Error processing discussion: ${error.message}`, 'error');
            this.handleReject(); // Skip on error
        }
    }

    async getAISuggestion(discussion) {
        try {
            const response = await fetch('/api/suggest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(discussion)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to get AI suggestion: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            // Do NOT fallback to dummy suggestions - throw the error
            throw new Error(`Could not get AI suggestion: ${error.message}`);
        }
    }

    updateProgress() {
        const progressText = document.getElementById('progressText');
        const discussionId = document.getElementById('discussionId');
        const progressFill = document.getElementById('progressFill');
        
        const current = this.currentDiscussionIndex + 1;
        const total = this.discussions.length;
        const percentage = (current / total) * 100;
        
        progressText.textContent = `Discussion ${current} of ${total}`;
        discussionId.textContent = `#${this.discussions[this.currentDiscussionIndex].id}`;
        progressFill.style.width = `${percentage}%`;
    }

    updateDiscussionInfo(discussion) {
        document.getElementById('discussionComment').textContent = discussion.comment;
        document.getElementById('fileName').textContent = 'app.js';
        
        const lineNumbers = discussion.lines.length === 1 
            ? discussion.lines[0].toString()
            : `${Math.min(...discussion.lines)}-${Math.max(...discussion.lines)}`;
        document.getElementById('lineNumbers').textContent = lineNumbers;
    }

    displayCodeComparison(originalCode, suggestedCode) {
        const diffView = document.getElementById('diffView');
        diffView.innerHTML = '';
        
        // Simple diff implementation for demo
        const originalLines = originalCode.split('\n');
        const suggestedLines = suggestedCode.split('\n');
        
        // Find common lines and differences
        const maxLines = Math.max(originalLines.length, suggestedLines.length);
        
        for (let i = 0; i < maxLines; i++) {
            const originalLine = originalLines[i] || '';
            const suggestedLine = suggestedLines[i] || '';
            
            if (originalLine === suggestedLine) {
                // Unchanged line
                const lineElement = document.createElement('div');
                lineElement.className = 'diff-line unchanged';
                lineElement.textContent = `  ${originalLine}`;
                diffView.appendChild(lineElement);
            } else {
                // Show removed line if it exists
                if (originalLine) {
                    const removedElement = document.createElement('div');
                    removedElement.className = 'diff-line removed';
                    removedElement.textContent = `- ${originalLine}`;
                    diffView.appendChild(removedElement);
                }
                
                // Show added line if it exists
                if (suggestedLine) {
                    const addedElement = document.createElement('div');
                    addedElement.className = 'diff-line added';
                    addedElement.textContent = `+ ${suggestedLine}`;
                    diffView.appendChild(addedElement);
                }
            }
        }
    }

    showLoadingState(show) {
        const loadingState = document.getElementById('loadingState');
        const actionButtons = document.querySelector('.action-buttons');
        const diffContainer = document.querySelector('.diff-container');
        
        if (show) {
            loadingState.style.display = 'flex';
            actionButtons.style.display = 'none';
            diffContainer.style.opacity = '0.5';
        } else {
            loadingState.style.display = 'none';
            actionButtons.style.display = 'flex';
            diffContainer.style.opacity = '1';
        }
    }

    async handleAccept() {
        const discussion = this.discussions[this.currentDiscussionIndex];
        
        try {
            this.updateStatus('Applying fix...', 'processing');
            this.disableActionButtons(true);
            
            // Apply the fix via backend (which now immediately removes the discussion)
            const result = await this.applyFix(discussion);
            
            this.appliedCount++;
            this.resolvedDiscussionIds.push(discussion.id);
            
            // Show success notification with additional info
            if (result.discussionRemoved) {
                this.showNotification(
                    `✅ Fix applied for discussion #${discussion.id} and removed from discussions.json. ${result.remainingDiscussions} discussions remaining.`, 
                    'success'
                );
            } else {
                this.showNotification(`✅ Fix applied for discussion #${discussion.id}`, 'success');
            }
            
            this.moveToNextDiscussion();
            
        } catch (error) {
            this.showNotification(`Error applying fix: ${error.message}`, 'error');
            this.disableActionButtons(false);
        }
    }

    async handleReject() {
        const discussion = this.discussions[this.currentDiscussionIndex];
        
        this.skippedCount++;
        this.showNotification(`⏭️ Skipped discussion #${discussion.id}`, 'info');
        
        this.moveToNextDiscussion();
    }

    async applyFix(discussion) {
        try {
            const response = await fetch('/api/apply-fix', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(discussion)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to apply fix: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            // Do NOT simulate success - throw the real error
            throw new Error(`Could not apply fix: ${error.message}`);
        }
    }

    moveToNextDiscussion() {
        this.disableActionButtons(false);
        
        if (this.currentDiscussionIndex < this.discussions.length - 1) {
            this.currentDiscussionIndex++;
            setTimeout(() => {
                this.processCurrentDiscussion();
            }, 1000);
        } else {
            // All discussions processed
            this.finishProcessing();
        }
    }

    async finishProcessing() {
        this.updateStatus('Complete', 'complete');
        
        // No need for additional cleanup since discussions are immediately removed when accepted
        // All resolved discussions have already been removed from discussions.json during processing
        
        this.showSummary();
    }

    showSummary() {
        const successRate = this.processedCount > 0 
            ? Math.round((this.appliedCount / this.processedCount) * 100) 
            : 0;
        
        document.getElementById('totalDiscussions').textContent = this.processedCount;
        document.getElementById('appliedFixes').textContent = this.appliedCount;
        document.getElementById('skippedFixes').textContent = this.skippedCount;
        document.getElementById('successRate').textContent = `${successRate}%`;
        
        const summaryMessage = document.getElementById('summaryMessage');
        if (this.appliedCount > 0) {
            summaryMessage.textContent = `Great job! ${this.appliedCount} fix(es) applied to app.js. Resolved discussions were automatically removed from discussions.json as they were processed.`;
        } else {
            summaryMessage.textContent = 'No changes were made to the code files.';
        }
        
        this.showSummaryView();
        this.showNotification('🎉 All discussions processed!', 'success');
    }

    disableActionButtons(disabled) {
        document.getElementById('acceptBtn').disabled = disabled;
        document.getElementById('rejectBtn').disabled = disabled;
    }

    restartProcess() {
        this.currentDiscussionIndex = 0;
        this.discussions = [];
        this.processedCount = 0;
        this.appliedCount = 0;
        this.skippedCount = 0;
        this.resolvedDiscussionIds = [];
        
        document.getElementById('runAgainBtn').disabled = true;
        this.showWelcomeScreen();
        this.clearNotifications();
    }

    showNotification(message, type = 'info') {
        const notificationArea = document.getElementById('notificationArea');
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        notification.innerHTML = `
            <span class="icon">${icon}</span>
            <span>${message}</span>
        `;
        
        notificationArea.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    clearNotifications() {
        const notificationArea = document.getElementById('notificationArea');
        notificationArea.innerHTML = '';
    }
}

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new AICodeResolverUI();
}); 