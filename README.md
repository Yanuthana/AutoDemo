# AutoDemo - Enhanced AI Code Resolver v2.0

An advanced AI-assisted code suggestion tool that reads review feedback and applies automated code fixes using OpenAI. Features visual diff comparison, enhanced prompts, and sequential processing of multiple review comments.

## 🚀 New Features in v2.0

- **📊 Visual Diff Display** - See changes highlighted with colors (green for additions, red for deletions)
- **🔄 Sequential Processing** - Loops through all discussions in `discussions.json`
- **🧠 Enhanced AI Prompts** - Includes file name, line numbers, and context for better suggestions
- **📈 Progress Tracking** - Shows processing progress and final statistics
- **🎯 Better UX** - Improved formatting, emojis, and user guidance
- **🛡️ Robust Error Handling** - Validates input and handles edge cases gracefully

## 🔧 Features

- Processes multiple code review comments automatically
- Extracts specific line ranges from code files
- Sends enhanced context to OpenAI for better suggestions
- Interactive approval process with visual diff comparison
- Secure API key management
- Comprehensive error handling and logging
- Success rate tracking and summary statistics

## 📁 Files Structure

```
├── resolveWithAI.js     # Enhanced main script
├── app.js               # Demo code file
├── discussions.json     # Multiple review comments
├── package.json         # Dependencies (includes diff library)
├── .env                 # API key (create this)
└── README.md           # This file
```

## 🚀 Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Create .env File**
   Create a `.env` file in the project root:
   ```
   OPENAI_API_KEY=your-actual-openai-key-here
   ```
   Replace `your-actual-openai-key-here` with your real OpenAI API key.

3. **Get OpenAI API Key**
   - Visit [OpenAI API Keys](https://platform.openai.com/api-keys)
   - Create a new API key
   - Copy it to your `.env` file

## 🛠️ Usage

Run the enhanced script:
```bash
node resolveWithAI.js
```

Or use npm script:
```bash
npm start
```

## 📋 How It Works

1. **Loads All Discussions** - Reads all review comments from `discussions.json`
2. **Sequential Processing** - Goes through each discussion one by one
3. **Enhanced Context** - Sends file name, line numbers, and comment to OpenAI
4. **Visual Diff** - Shows before/after comparison with color-coded changes
5. **User Decision** - Ask for approval before applying each fix
6. **File Updates** - Applies approved changes to `app.js`
7. **Summary Report** - Shows statistics of applied vs skipped fixes

## 📝 Enhanced discussions.json Format

```json
[
  {
    "id": 1,
    "comment": "Add a null check for user.profile.name",
    "lines": [1, 2]
  },
  {
    "id": 2,
    "comment": "Use const instead of let for immutable variables",
    "lines": [4]
  },
  {
    "id": 3,
    "comment": "Add error handling for the console.log call",
    "lines": [3]
  }
]
```

## 🎨 Enhanced AI Prompt Format

The tool now sends richer context to OpenAI:

```
You are helping improve JavaScript code based on code review feedback.

File: app.js
Lines: 1-2
Comment: "Add a null check for user.profile.name"

Original Code:
function getUserName(user) {
  return user.profile.name;
}

Please suggest an improved version that solves the review comment...
```

## 🔍 Visual Diff Example

```
📊 CODE COMPARISON
═══════════════════════════════════════════════════════════════════════════════
  function getUserName(user) {
-   return user.profile.name;
+   return user && user.profile ? user.profile.name : null;
  }
═══════════════════════════════════════════════════════════════════════════════
Legend: + Added | - Removed |   Unchanged
═══════════════════════════════════════════════════════════════════════════════
```

## 🎯 Processing Summary

After processing all discussions, you'll see:

```
🎯 PROCESSING SUMMARY
══════════════════════════════════════════════════════
📊 Total Discussions: 3
✅ Applied Fixes: 2
⏭️  Skipped: 1
📈 Success Rate: 67%
══════════════════════════════════════════════════════
🎉 2 fix(es) applied to app.js!
```

## 🔐 Security

- API key is stored in `.env` file (not committed to version control)
- All API calls use HTTPS
- Input validation and error handling throughout
- No sensitive data logged

## 🛑 Error Handling

The enhanced tool handles:
- Missing API key
- File not found errors
- Invalid JSON in discussions
- Line numbers beyond file bounds
- OpenAI API errors and timeouts
- Network connectivity issues
- User cancellation
- Malformed discussion entries

## 🧪 Testing

The tool comes with enhanced sample data:
- Multiple review comments in `discussions.json`
- Various types of code issues in `app.js`
- Comprehensive error scenarios covered

## 📊 Sample Enhanced Output

```
🚀 Starting Enhanced AI Code Resolver...
═══════════════════════════════════════════════════════════════════════════════
🤖 AI-POWERED CODE REVIEW ASSISTANT
═══════════════════════════════════════════════════════════════════════════════
✅ Environment validation passed
ℹ️ Found 3 discussion(s) to process

────────────────────────────────────────────────────────────────────────────────
ℹ️ Processing discussion 1/3: "Add a null check for user.profile.name"
ℹ️ Extracted 2 line(s) from app.js
ℹ️ Sending request to OpenAI...
✅ Received suggestion from OpenAI

🔍 REVIEW DISCUSSION #1
──────────────────────────────────────────────────────
💬 Comment: "Add a null check for user.profile.name"
📍 Lines: 1, 2
📄 File: app.js

📊 CODE COMPARISON
═══════════════════════════════════════════════════════════════════════════════
  function getUserName(user) {
-   return user.profile.name;
+   return user && user.profile ? user.profile.name : null;
  }
═══════════════════════════════════════════════════════════════════════════════
Legend: + Added | - Removed |   Unchanged
═══════════════════════════════════════════════════════════════════════════════

? 🤖 Do you want to apply this AI-suggested fix? (y/N)
```

## 🆕 What's New in v2.0

- **Visual diff comparison** using the `diff` library
- **Enhanced OpenAI prompts** with file context and metadata
- **Sequential processing** of all discussions automatically
- **Progress indicators** showing current discussion number
- **Summary statistics** with success rates
- **Better error messages** with troubleshooting tips
- **Improved user interface** with emojis and formatting
- **Robust validation** of discussions.json format
- **Graceful error recovery** - continues processing if one discussion fails
 