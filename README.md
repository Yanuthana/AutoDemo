# AutoDemo - AI Code Resolver

A local AI-assisted code suggestion tool that reads review feedback and applies automated code fixes using OpenAI. This tool runs in Cursor IDE as a testable script.

## 🔧 Features

- Reads code review comments from JSON file
- Extracts specific line ranges from code files
- Sends review context to OpenAI for suggestions
- Interactive approval process for applying fixes
- Secure API key management
- Comprehensive error handling and logging

## 📁 Files Structure

```
├── resolveWithAI.js     # Main script
├── app.js               # Demo code file
├── discussions.json     # Mock review data
├── package.json         # Dependencies
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

Run the script:
```bash
node resolveWithAI.js
```

Or use npm script:
```bash
npm start
```

## 📋 How It Works

1. **Reads Review Data**: Loads `discussions.json` containing review comments and line numbers
2. **Extracts Code**: Gets the specified lines from `app.js`
3. **Calls OpenAI**: Sends the review comment and code to OpenAI for suggestions
4. **User Approval**: Shows original vs suggested code and asks for approval
5. **Applies Fix**: If approved, updates the code file with the suggestion
6. **Logs Actions**: Provides clear feedback on all operations

## 📝 Example Flow

The demo includes:
- `app.js` with a null safety issue
- `discussions.json` with a review comment about adding null checks
- The tool will suggest a fix and ask for your approval

## 🔐 Security

- API key is stored in `.env` file (not committed to version control)
- All API calls use HTTPS
- Input validation and error handling throughout

## 🛑 Error Handling

The tool handles:
- Missing API key
- File not found errors
- Invalid JSON in discussions
- OpenAI API errors
- Network timeouts
- User cancellation

## 🧪 Testing

The tool comes with sample data ready for testing:
- Buggy code in `app.js`
- Review comment in `discussions.json`
- Just add your OpenAI API key and run!

## 📊 Sample Output

```
ℹ️ [2024-01-01T12:00:00.000Z] 🚀 Starting AI Code Resolver...
✅ [2024-01-01T12:00:00.000Z] Environment validation passed
ℹ️ [2024-01-01T12:00:00.000Z] Found 1 discussion(s) to process
ℹ️ [2024-01-01T12:00:00.000Z] Processing discussion: Add a null check for user.profile.name
ℹ️ [2024-01-01T12:00:00.000Z] Extracted code from lines 1-2
ℹ️ [2024-01-01T12:00:00.000Z] Sending request to OpenAI...
✅ [2024-01-01T12:00:01.000Z] Received suggestion from OpenAI

============================================================
📝 ORIGINAL CODE:
============================================================
function getUserName(user) {
  return user.profile.name;

============================================================
🤖 SUGGESTED FIX:
============================================================
function getUserName(user) {
  return user && user.profile ? user.profile.name : null;
============================================================
? Do you want to apply this fix? (y/N) 
