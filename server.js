const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const users = new Map(); // nick → socket.id
const chatHistory = new Map(); // 'nick1-nick2' → [{from, msg, timestamp}]
const usersIds = new Set();
const userNicks = new Set(['admin']);
const ADMIN_PW = "444";

function getChatKey(nick1, nick2) {
  return [nick1, nick2].sort().join('-');
}

io.on('connection', (socket) => {
  console.log('👤 Подключен:', socket.id);
  usersIds.add(socket.id);

  socket.on("admin_auth", (password) => {
    if (password === ADMIN_PW && userNicks.has('admin')) {
      socket.emit("admin_auth_ok");
    } else {
      socket.emit("admin_auth_fail");
    }
  });

  socket.on("add nick", (nick) => {
    if(socket.nick === 'admin'){
      userNicks.add(nick);
      sendUserNicks();
    }
  });

  socket.on("remove nick", (nick) => {
    if (nick && socket.nick === 'admin') {
      const socketId = users.get(nick);
      users.delete(nick);
      usersIds.delete(socketId);

      userNicks.delete(nick);
      socket.to(socketId).emit('load state', userNicks.has(nick));
      sendUserNicks();
    }
  });

  socket.on('get nicks', () => {
    sendUserNicks();
  });

  socket.on('check nick', (nick) => {
    socket.emit('load state', userNicks.has(nick) && nick !== 'admin');
  });

  socket.on('register', (nick) => {
    if (users.has(nick)) {
      socket.emit('nick error', 'Ник занят!');
      return;
    }
    users.set(nick, socket.id);
    socket.nick = nick;
    console.log(`✅ Зарегистрирован: ${nick} → ${socket.id}`);

    userNicks.delete(nick);
    sendUserNicks();
    
    // ✅ Отправляем историю всех чатов для этого пользователя
    const history = [];
    for (let [key, msgs] of chatHistory) {
      if (key.includes(nick)) {
        history.push({with: key.split('-').find(u => u !== nick), messages: msgs.slice(-50)}); // Последние 50
      }
    }
    socket.emit('chat history', history);
    
    broadcastUsers();
    socket.emit('registered', nick);
  });

  socket.on('private message', ({ to, msg }) => {
    console.log(`📨 ЛС от ${socket.nick} к ${to}: "${msg}"`);
    if (to === socket.nick) return;
    
    const toId = users.get(to);
    if (toId && toId !== socket.id) {
      const key = getChatKey(socket.nick, to);
      if (!chatHistory.has(key)) chatHistory.set(key, []);
      
      const message = {
        from: socket.nick,
        msg,
        timestamp: new Date().toISOString()
      };
      
      chatHistory.get(key).push(message);
      
      // Ограничиваем историю (последние 100)
      if (chatHistory.get(key).length > 100) {
        chatHistory.set(key, chatHistory.get(key).slice(-100));
      }
      
      console.log(`💾 Сохранено в ${key}`);
      
      // Отправляем обоим
      io.to(toId).emit('private message', { from: socket.nick, msg, to });
      io.to(socket.id).emit('private message', { from: socket.nick, msg, to });
      
      console.log('✅ ЛС доставлено');
    } else {
      console.log('❌ Получатель оффлайн');
    }
  });

  socket.on('user list request', () => {
    const userList = Array.from(users.keys());
    socket.emit('user list', userList);
  });

  socket.on('disconnect', () => {
    if (socket.nick) {
      console.log(`👋 ${socket.nick} отключился`);
      users.delete(socket.nick);
      usersIds.delete(socket.id);

      userNicks.add(socket.nick);
      sendUserNicks();
      broadcastUsers();
    }
  });
});

function broadcastUsers() {
  const userList = Array.from(users.keys());
  io.emit('user list', userList);
}

function sendUserNicks() {
  Array.from(usersIds).forEach(id => {
    io.emit('send user nicks', Array.from(userNicks));
  });
}

server.listen(3000, () => console.log('🚀 http://localhost:3000'));
