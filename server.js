const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('A device connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('A device disconnected:', socket.id);
    });
});

const PORT = 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('🎮 LetsPlayTogether is running!');
    console.log(`📱 Open: http://localhost:${PORT}`);
    console.log('');
});
