# AI Code Resolver UI

A modern, developer-friendly web interface for the AI Code Resolver tool. This UI provides a clean, VS Code-like experience for reviewing and applying AI-suggested code improvements.

## Features

✨ **Modern Interface**
- VS Code-like dark theme
- Clean, professional design
- Responsive layout

📊 **Visual Code Comparison**
- Diff-style view with color coding
- Red lines for removed code
- Green lines for added code
- Syntax highlighting

🎯 **Smart Workflow**
- Progress tracking
- Sequential processing
- Accept/Reject decisions
- Automatic file updates

📈 **Real-time Feedback**
- Loading states
- Status indicators
- Toast notifications
- Success/error handling

## Quick Start

### 1. Install Dependencies

```bash
cd ui
npm install
```

### 2. Start the Server

```bash
npm start
```

The server will start at `http://localhost:3000`

### 3. Open in Browser

Navigate to `http://localhost:3000` in your browser to access the UI.

## How It Works

### Backend Integration

The UI server (`server.js`) acts as a bridge between the web interface and your existing `resolveWithAI.js` script:

- **Reuses existing logic**: All AI processing, file I/O, and OpenAI integration
- **API endpoints**: Exposes REST APIs for the frontend
- **File management**: Handles `app.js` and `discussions.json` updates
- **Error handling**: Provides meaningful error messages

### API Endpoints

- `GET /api/discussions` - Load discussions from `discussions.json`
- `POST /api/suggest` - Get AI suggestion for a discussion
- `POST /api/apply-fix` - Apply a fix to `app.js`
- `POST /api/update-discussions` - Remove resolved discussions
- `GET /api/health` - Health check and environment validation

### Workflow

1. **Welcome Screen**: Start the review process
2. **Discussion View**: 
   - Shows review comment
   - Displays code comparison
   - Accept/Reject buttons
3. **Summary View**: Statistics and completion status

## Requirements

- Node.js 12+
- All dependencies from the main project
- `.env` file with `OPENAI_API_KEY`
- `app.js` and `discussions.json` files in the parent directory

## File Structure

```
ui/
├── index.html      # Main UI interface
├── styles.css      # VS Code-like styling
├── app.js          # Frontend JavaScript
├── server.js       # Express server bridge
├── package.json    # UI dependencies
└── README.md       # This file
```

## Development

### Run in Development Mode

```bash
npm run dev
```

This uses `nodemon` for automatic server restart on file changes.

### Customization

- **Styling**: Modify `styles.css` for theme changes
- **Frontend Logic**: Update `app.js` for UI behavior
- **Backend API**: Extend `server.js` for new features

## Troubleshooting

### Common Issues

1. **Server won't start**
   - Check if port 3000 is available
   - Ensure all dependencies are installed
   - Verify `.env` file exists with OpenAI API key

2. **UI shows errors**
   - Check browser console for JavaScript errors
   - Verify `app.js` and `discussions.json` exist
   - Ensure OpenAI API key is valid

3. **API calls fail**
   - Check server logs for error details
   - Verify file permissions
   - Test API endpoints directly

### Debug Mode

The server provides detailed logging. Check the console output for:
- Environment validation results
- API request/response details
- File operation status
- Error stack traces

## Production Deployment

For production use:

1. Set `NODE_ENV=production`
2. Use a proper process manager (PM2, systemd)
3. Configure reverse proxy (nginx, Apache)
4. Set up SSL/TLS certificates
5. Configure environment variables securely

## Contributing

The UI is designed to be extensible. Common areas for enhancement:

- Additional diff visualization options
- Bulk accept/reject functionality
- Integration with other IDEs
- Custom AI prompts
- User preferences and settings

## License

MIT License - see the main project LICENSE file for details. 