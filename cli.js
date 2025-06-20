#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const GitHubIntegration = require('./github-integration');
const UndoManager = require('./undo-manager');
const EnhancedAICodeResolver = require('./enhanced-resolver');

const program = new Command();

// Global spinner for loading states
let spinner;

/**
 * Display banner
 */
function displayBanner() {
    console.log(chalk.cyan('═'.repeat(80)));
    console.log(chalk.cyan.bold('🤖 AI CODE RESOLVER v3.0 - GitHub Integration & CLI'));
    console.log(chalk.cyan('═'.repeat(80)));
    console.log(chalk.gray('Automated code review suggestions with GitHub integration'));
    console.log(chalk.gray('https://github.com/your-repo/coderev-resolver'));
    console.log();
}

/**
 * Check environment setup - now only checks required vars
 */
async function checkEnvironment() {
    const envFile = '.env';
    const requiredVars = ['OPENAI_API_KEY'];
    
    if (!await fs.pathExists(envFile)) {
        console.log(chalk.yellow('⚠️  Warning: .env file not found'));
        console.log(chalk.gray('💡 Create a .env file with:'));
        console.log(chalk.gray('   OPENAI_API_KEY=your_openai_key'));
        console.log(chalk.gray('   GITHUB_TOKEN=your_github_token (optional for GitHub integration)'));
        console.log();
        return false;
    }
    
    require('dotenv').config();
    
    const missing = requiredVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
        console.log(chalk.red(`❌ Missing required environment variables: ${missing.join(', ')}`));
        return false;
    }
    
    return true;
}

/**
 * Check GitHub token availability
 */
function hasGitHubToken() {
    return !!process.env.GITHUB_TOKEN;
}

/**
 * Validate repository format
 */
function validateRepository(input) {
    if (!input || typeof input !== 'string') {
        return 'Repository is required';
    }
    
    const parts = input.trim().split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return 'Repository format must be "owner/repo" (e.g., "microsoft/vscode")';
    }
    
    return true;
}

/**
 * Validate pull request number
 */
function validatePullNumber(input) {
    if (!input) {
        return true; // Optional field
    }
    
    const num = parseInt(input);
    if (isNaN(num) || num <= 0) {
        return 'Pull request number must be a positive integer';
    }
    
    return true;
}

/**
 * Prompt for GitHub repository and PR information
 */
async function promptForGitHubInfo(options = {}) {
    console.log(chalk.cyan('\n🔗 GitHub Integration Setup'));
    console.log(chalk.gray('Please provide the following information:'));
    
    const questions = [
        {
            type: 'input',
            name: 'repository',
            message: '📁 Enter GitHub repository (owner/repo):',
            validate: validateRepository,
            when: !options.repository
        },
        {
            type: 'input',
            name: 'pullNumber',
            message: '🔢 Enter Pull Request number (leave empty for all open PRs):',
            validate: validatePullNumber,
            when: !options.pullNumber
        }
    ];

    const answers = await inquirer.prompt(questions);
    
    return {
        repository: options.repository || answers.repository,
        pullNumber: options.pullNumber || (answers.pullNumber ? parseInt(answers.pullNumber) : null)
    };
}

/**
 * Fetch command - Get discussions from GitHub
 */
async function fetchCommand(options) {
    try {
        displayBanner();
        
        if (!await checkEnvironment()) {
            process.exit(1);
        }
        
        // Check if GitHub token is available
        if (!hasGitHubToken()) {
            console.log(chalk.red('❌ GitHub integration requires a token'));
            console.log(chalk.gray('💡 Add GITHUB_TOKEN to your .env file'));
            console.log(chalk.gray('💡 Get a token at: https://github.com/settings/tokens'));
            process.exit(1);
        }
        
        const github = new GitHubIntegration();
        
        // Test token first
        spinner = ora('Validating GitHub token...').start();
        const tokenValid = await github.testTokenOnly();
        
        if (!tokenValid) {
            spinner.fail('GitHub token validation failed');
            process.exit(1);
        }
        
        spinner.succeed('GitHub token validated');
        
        // Get repository and PR info
        const gitHubInfo = await promptForGitHubInfo({
            pullNumber: options.pr ? parseInt(options.pr) : null
        });
        
        // Test connection to repository
        spinner = ora(`Connecting to ${gitHubInfo.repository}...`).start();
        const connected = await github.testConnection(gitHubInfo.repository);
        
        if (!connected) {
            spinner.fail('Repository connection failed');
            process.exit(1);
        }
        
        spinner.succeed(`Connected to ${gitHubInfo.repository}`);
        
        // Fetch discussions
        if (gitHubInfo.pullNumber) {
            spinner = ora(`Fetching discussions from PR #${gitHubInfo.pullNumber}...`).start();
        } else {
            spinner = ora('Fetching discussions from all open PRs...').start();
        }
        
        const result = await github.fetchDiscussions(gitHubInfo.repository, gitHubInfo.pullNumber);
        
        if (result.count === 0) {
            spinner.warn('No discussions found');
            console.log(chalk.yellow('\n🤔 No review discussions found'));
            console.log(chalk.gray('💡 Make sure there are review comments on your pull request(s)'));
            console.log(chalk.gray('💡 Comments should be inline code review comments'));
        } else {
            spinner.succeed(`Fetched ${result.count} discussion(s)`);
            console.log(chalk.green(`\n✅ Successfully fetched ${result.count} discussion(s) from GitHub`));
            console.log(chalk.gray('📁 Saved to discussions.json'));
            console.log(chalk.cyan('\n💡 Run "coderev resolve" to start processing discussions'));
        }
        
    } catch (error) {
        if (spinner) spinner.fail('Fetch failed');
        console.log(chalk.red(`\n❌ Error: ${error.message}`));
        process.exit(1);
    }
}

/**
 * Resolve command - Process discussions with AI
 * Now includes GitHub integration prompt if discussions.json is missing
 */
async function resolveCommand(options) {
    try {
        displayBanner();
        
        if (!await checkEnvironment()) {
            process.exit(1);
        }
        
        // Check if discussions.json exists
        if (!await fs.pathExists('discussions.json')) {
            console.log(chalk.yellow('📄 No discussions.json file found'));
            
            if (hasGitHubToken()) {
                console.log(chalk.cyan('\n🔗 Would you like to fetch discussions from GitHub?'));
                
                const fetchFromGitHub = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'proceed',
                        message: 'Fetch discussions from GitHub now?',
                        default: true
                    }
                ]);
                
                if (fetchFromGitHub.proceed) {
                    // Inline GitHub fetch process
                    const github = new GitHubIntegration();
                    
                    spinner = ora('Validating GitHub token...').start();
                    const tokenValid = await github.testTokenOnly();
                    
                    if (!tokenValid) {
                        spinner.fail('GitHub token validation failed');
                        process.exit(1);
                    }
                    
                    spinner.succeed('GitHub token validated');
                    
                    const gitHubInfo = await promptForGitHubInfo();
                    
                    spinner = ora(`Connecting to ${gitHubInfo.repository}...`).start();
                    const connected = await github.testConnection(gitHubInfo.repository);
                    
                    if (!connected) {
                        spinner.fail('Repository connection failed');
                        process.exit(1);
                    }
                    
                    spinner.succeed(`Connected to ${gitHubInfo.repository}`);
                    
                    if (gitHubInfo.pullNumber) {
                        spinner = ora(`Fetching discussions from PR #${gitHubInfo.pullNumber}...`).start();
                    } else {
                        spinner = ora('Fetching discussions from all open PRs...').start();
                    }
                    
                    const result = await github.fetchDiscussions(gitHubInfo.repository, gitHubInfo.pullNumber);
                    
                    if (result.count === 0) {
                        spinner.warn('No discussions found');
                        console.log(chalk.yellow('\n🤔 No review discussions found'));
                        console.log(chalk.gray('💡 Make sure there are review comments on your pull request(s)'));
                        process.exit(0);
                    } else {
                        spinner.succeed(`Fetched ${result.count} discussion(s)`);
                        console.log(chalk.green(`\n✅ Fetched ${result.count} discussion(s) from GitHub`));
                        console.log(chalk.cyan('\n🚀 Starting AI processing...'));
                    }
                } else {
                    console.log(chalk.gray('\n💡 Alternative options:'));
                    console.log(chalk.gray('   • Run "coderev fetch" to get discussions from GitHub'));
                    console.log(chalk.gray('   • Create discussions.json manually with your review comments'));
                    process.exit(0);
                }
            } else {
                console.log(chalk.gray('\n💡 Options to get discussions:'));
                console.log(chalk.gray('   • Add GITHUB_TOKEN to .env and run "coderev fetch"'));
                console.log(chalk.gray('   • Create discussions.json manually with your review comments'));
                process.exit(1);
            }
        }
        
        const resolver = new EnhancedAICodeResolver();
        await resolver.run();
        
    } catch (error) {
        console.log(chalk.red(`\n❌ Error: ${error.message}`));
        process.exit(1);
    }
}

/**
 * Undo command - Revert last change
 */
async function undoCommand(options) {
    try {
        displayBanner();
        
        const undoManager = new UndoManager();
        
        // Check undo status
        const status = await undoManager.getUndoStatus();
        
        if (!status.available) {
            console.log(chalk.yellow('⚠️  No undo available'));
            console.log(chalk.gray(`Reason: ${status.reason}`));
            console.log(chalk.gray('💡 Undo is only available after applying a code fix'));
            return;
        }
        
        console.log(chalk.cyan('↩️  Undo Information:'));
        console.log(chalk.gray(`📁 File: ${status.filePath}`));
        console.log(chalk.gray(`💬 Change: ${status.changeDescription}`));
        console.log(chalk.gray(`🕒 Made at: ${new Date(status.timestamp).toLocaleString()}`));
        
        if (options.force) {
            // Perform undo without confirmation
            spinner = ora('Performing undo...').start();
            await undoManager.performUndo();
            spinner.succeed('Undo completed');
        } else {
            // Ask for confirmation
            const inquirer = require('inquirer');
            const confirm = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Do you want to undo this change?',
                    default: false
                }
            ]);
            
            if (confirm.proceed) {
                spinner = ora('Performing undo...').start();
                await undoManager.performUndo();
                spinner.succeed('Undo completed');
                console.log(chalk.green('\n✅ Change successfully reverted'));
            } else {
                console.log(chalk.gray('Undo cancelled'));
            }
        }
        
    } catch (error) {
        if (spinner) spinner.fail('Undo failed');
        console.log(chalk.red(`\n❌ Error: ${error.message}`));
        process.exit(1);
    }
}

/**
 * Status command - Show current status
 */
async function statusCommand() {
    try {
        displayBanner();
        
        // Check environment
        const envOk = await checkEnvironment();
        console.log(chalk.cyan('🔧 Environment Status:'));
        console.log(`   OpenAI API: ${envOk ? chalk.green('✓ Configured') : chalk.red('✗ Missing')}`);
        console.log(`   GitHub Token: ${hasGitHubToken() ? chalk.green('✓ Configured') : chalk.yellow('⚠ Not configured')}`);
        
        if (hasGitHubToken()) {
            // Test token validity
            try {
                const github = new GitHubIntegration();
                const tokenValid = await github.testTokenOnly();
                if (tokenValid) {
                    console.log(chalk.gray('   GitHub token is valid and ready for use'));
                }
            } catch (error) {
                console.log(chalk.red('   GitHub token validation failed'));
            }
        } else {
            console.log(chalk.gray('   Add GITHUB_TOKEN to .env for GitHub integration'));
        }
        
        // Check discussions file
        console.log(chalk.cyan('\n📄 Discussions:'));
        if (await fs.pathExists('discussions.json')) {
            const discussions = await fs.readJSON('discussions.json');
            console.log(`   discussions.json: ${chalk.green('✓ Found')} (${discussions.length} items)`);
            
            if (discussions.length > 0) {
                console.log(chalk.gray('   Recent discussions:'));
                discussions.slice(0, 3).forEach(d => {
                    console.log(chalk.gray(`     #${d.id}: ${d.comment.substring(0, 50)}${d.comment.length > 50 ? '...' : ''}`));
                });
                if (discussions.length > 3) {
                    console.log(chalk.gray(`     ... and ${discussions.length - 3} more`));
                }
            }
        } else {
            console.log(`   discussions.json: ${chalk.yellow('⚠ Not found')}`);
            if (hasGitHubToken()) {
                console.log(chalk.gray('   💡 Run "coderev fetch" to get discussions from GitHub'));
            } else {
                console.log(chalk.gray('   💡 Add GITHUB_TOKEN to .env or create discussions.json manually'));
            }
        }
        
        // Check undo status
        const undoManager = new UndoManager();
        const undoStatus = await undoManager.getUndoStatus();
        console.log(chalk.cyan('\n↩️  Undo Status:'));
        if (undoStatus.available) {
            console.log(`   Last change: ${chalk.green('✓ Available')}`);
            console.log(chalk.gray(`   File: ${undoStatus.filePath}`));
            console.log(chalk.gray(`   Change: ${undoStatus.changeDescription}`));
            console.log(chalk.gray(`   Time: ${new Date(undoStatus.timestamp).toLocaleString()}`));
        } else {
            console.log(`   Last change: ${chalk.gray('None available')}`);
            console.log(chalk.gray(`   Reason: ${undoStatus.reason}`));
        }
        
        // Show next steps
        console.log(chalk.cyan('\n🚀 Next Steps:'));
        if (!envOk) {
            console.log(chalk.gray('   1. Configure your .env file with OPENAI_API_KEY'));
        } else if (!await fs.pathExists('discussions.json')) {
            if (hasGitHubToken()) {
                console.log(chalk.gray('   1. Run "coderev fetch" to get discussions from GitHub'));
                console.log(chalk.gray('   2. Or run "coderev resolve" for guided setup'));
            } else {
                console.log(chalk.gray('   1. Add GITHUB_TOKEN to .env and run "coderev fetch"'));
                console.log(chalk.gray('   2. Or create discussions.json manually'));
            }
        } else {
            const discussions = await fs.readJSON('discussions.json');
            if (discussions.length === 0) {
                if (hasGitHubToken()) {
                    console.log(chalk.gray('   1. Run "coderev fetch" to refresh discussions from GitHub'));
                } else {
                    console.log(chalk.gray('   1. Add discussions to discussions.json manually'));
                }
            } else {
                console.log(chalk.gray('   1. Run "coderev resolve" to start processing discussions'));
            }
        }
        
    } catch (error) {
        console.log(chalk.red(`\n❌ Error: ${error.message}`));
        process.exit(1);
    }
}

// Configure CLI commands
program
    .name('coderev-resolver')
    .description('AI-powered code review assistant with GitHub integration')
    .version('3.0.0')
    .hook('preAction', () => {
        // Set up global error handling
        process.on('unhandledRejection', (reason, promise) => {
            if (spinner) spinner.fail('Command failed');
            console.log(chalk.red('\n❌ Unexpected error occurred'));
            console.log(chalk.gray(reason));
            process.exit(1);
        });
    });

// Fetch command
program
    .command('fetch')
    .description('Fetch code review discussions from GitHub')
    .option('-p, --pr <number>', 'Fetch from specific pull request number')
    .action(fetchCommand);

// Resolve command
program
    .command('resolve')
    .description('Process discussions and apply AI-suggested fixes')
    .action(resolveCommand);

// Undo command
program
    .command('undo')
    .description('Revert the last applied change')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(undoCommand);

// Status command
program
    .command('status')
    .description('Show current configuration and status')
    .action(statusCommand);

// Default command (if no command specified, show help)
program
    .action(() => {
        displayBanner();
        program.help();
    });

// Parse command line arguments
program.parse();

// If no arguments provided, show status
if (process.argv.length <= 2) {
    statusCommand();
} 