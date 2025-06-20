#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { diffLines } = require('diff');

class UndoManager {
    constructor() {
        this.undoFilePath = 'undo.json';
        this.backupDir = '.coderev-backups';
    }

    /**
     * Ensure backup directory exists
     */
    async ensureBackupDir() {
        await fs.ensureDir(this.backupDir);
    }

    /**
     * Create a backup before making changes
     */
    async createBackup(filePath, originalContent, discussionId, changeDescription) {
        try {
            await this.ensureBackupDir();
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = path.basename(filePath);
            const backupFileName = `${fileName}.${timestamp}.backup`;
            const backupFilePath = path.join(this.backupDir, backupFileName);
            
            // Save the original content to backup file
            await fs.writeFile(backupFilePath, originalContent, 'utf8');
            
            // Create undo metadata
            const undoData = {
                timestamp: new Date().toISOString(),
                filePath: filePath,
                backupFilePath: backupFilePath,
                discussionId: discussionId,
                changeDescription: changeDescription,
                originalSize: originalContent.length,
                backupExists: true
            };
            
            // Save undo metadata (overwrite previous - only keep last action)
            await fs.writeJSON(this.undoFilePath, undoData, { spaces: 2 });
            
            console.log(`💾 Backup created: ${backupFileName}`);
            return undoData;
            
        } catch (error) {
            console.error(`❌ Failed to create backup: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check if undo is available
     */
    async canUndo() {
        try {
            if (!await fs.pathExists(this.undoFilePath)) {
                return { canUndo: false, reason: 'No undo data found' };
            }
            
            const undoData = await fs.readJSON(this.undoFilePath);
            
            if (!undoData.backupExists) {
                return { canUndo: false, reason: 'Backup file was already used' };
            }
            
            if (!await fs.pathExists(undoData.backupFilePath)) {
                return { canUndo: false, reason: 'Backup file no longer exists' };
            }
            
            if (!await fs.pathExists(undoData.filePath)) {
                return { canUndo: false, reason: 'Original file no longer exists' };
            }
            
            return { 
                canUndo: true, 
                undoData: undoData,
                message: `Can undo: ${undoData.changeDescription} (${undoData.timestamp})`
            };
            
        } catch (error) {
            return { canUndo: false, reason: `Error checking undo status: ${error.message}` };
        }
    }

    /**
     * Perform undo operation
     */
    async performUndo() {
        try {
            const undoCheck = await this.canUndo();
            
            if (!undoCheck.canUndo) {
                throw new Error(undoCheck.reason);
            }
            
            const undoData = undoCheck.undoData;
            
            // Read the backup content
            const backupContent = await fs.readFile(undoData.backupFilePath, 'utf8');
            const currentContent = await fs.readFile(undoData.filePath, 'utf8');
            
            // Show diff before undoing
            console.log('\n📊 UNDO PREVIEW - Changes that will be reverted:');
            console.log('═'.repeat(80));
            this.displayDiff(backupContent, currentContent);
            console.log('═'.repeat(80));
            
            // Restore the original content
            await fs.writeFile(undoData.filePath, backupContent, 'utf8');
            
            // Mark the undo as used (prevent double undo)
            undoData.backupExists = false;
            undoData.undoneAt = new Date().toISOString();
            await fs.writeJSON(this.undoFilePath, undoData, { spaces: 2 });
            
            console.log(`✅ Successfully undid: ${undoData.changeDescription}`);
            console.log(`📁 Restored: ${undoData.filePath}`);
            console.log(`🕒 Original change was made: ${undoData.timestamp}`);
            
            return {
                success: true,
                restoredFile: undoData.filePath,
                changeDescription: undoData.changeDescription
            };
            
        } catch (error) {
            console.error(`❌ Undo failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Display diff between two code versions
     */
    displayDiff(originalCode, currentCode) {
        const diff = diffLines(originalCode, currentCode);
        
        diff.forEach((part) => {
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
    }

    /**
     * Get undo status and information
     */
    async getUndoStatus() {
        try {
            const undoCheck = await this.canUndo();
            
            if (undoCheck.canUndo) {
                const undoData = undoCheck.undoData;
                return {
                    available: true,
                    timestamp: undoData.timestamp,
                    filePath: undoData.filePath,
                    changeDescription: undoData.changeDescription,
                    discussionId: undoData.discussionId
                };
            } else {
                return {
                    available: false,
                    reason: undoCheck.reason
                };
            }
        } catch (error) {
            return {
                available: false,
                reason: `Error: ${error.message}`
            };
        }
    }

    /**
     * Clean up old backup files (keep only last 5)
     */
    async cleanupOldBackups() {
        try {
            if (!await fs.pathExists(this.backupDir)) {
                return;
            }
            
            const files = await fs.readdir(this.backupDir);
            const backupFiles = files
                .filter(f => f.endsWith('.backup'))
                .map(f => ({
                    name: f,
                    path: path.join(this.backupDir, f),
                    stat: fs.statSync(path.join(this.backupDir, f))
                }))
                .sort((a, b) => b.stat.mtime - a.stat.mtime);
            
            // Keep only the 5 most recent backups
            const filesToDelete = backupFiles.slice(5);
            
            for (const file of filesToDelete) {
                await fs.remove(file.path);
                console.log(`🧹 Cleaned up old backup: ${file.name}`);
            }
            
            if (filesToDelete.length > 0) {
                console.log(`🧹 Removed ${filesToDelete.length} old backup file(s)`);
            }
            
        } catch (error) {
            console.warn(`⚠️  Warning: Could not clean up backups: ${error.message}`);
        }
    }

    /**
     * Clear all undo data and backups
     */
    async clearAll() {
        try {
            // Remove undo.json
            if (await fs.pathExists(this.undoFilePath)) {
                await fs.remove(this.undoFilePath);
                console.log('🗑️  Removed undo.json');
            }
            
            // Remove backup directory
            if (await fs.pathExists(this.backupDir)) {
                await fs.remove(this.backupDir);
                console.log('🗑️  Removed backup directory');
            }
            
            console.log('✅ All undo data cleared');
            
        } catch (error) {
            console.error(`❌ Failed to clear undo data: ${error.message}`);
            throw error;
        }
    }
}

module.exports = UndoManager; 