const express = require('express');
const app = express();
app.use(express.json());

app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello from backend!' });
});

app.post('/api/echo', (req, res) => {
    const text = req.body.text;
    res.json({ echo: text });
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
