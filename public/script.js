const socket = io();
let currentNick = null;
let chats = {};
let currentTab = null;
let unreadChats = new Set();
const screens = ["role-screen", "nick-form", "chat", "admin-screen", "admin-tools", "admin-password", "admin-login"];

// состояние чата (роль, ник, открытые вкладки и т.д.)
let appState = {
  nick: '',
};

//Загружаем состояние после перезагрузки страницы
window.addEventListener('load', () => {
  loadState();
});

function saveState() {
  localStorage.setItem('chatState', JSON.stringify(appState));
}

// восстанови состояние (при загрузке страницы)
function loadState() {
  const saved = localStorage.getItem('chatState');
  if (saved) {
    appState = { ...appState, ...JSON.parse(saved) };
    socket.emit('check nick', appState.nick);
  } else {
    show("role-screen");
  }
}

socket.on('load state', (success) => {
  if(success) {
    const saved = localStorage.getItem('chatState');
    appState = { ...appState, ...JSON.parse(saved) };
    
    // примени состояние
    
    if(appState.nick !== '') {
      socket.emit('register', appState.nick);
    } else {
      show("role-screen");
    }
  } else {
    appState.nick = '';
    saveState();
    show("role-screen");
  }
});

function show(...ids) {
  screens.forEach(s => (document.getElementById(s).style.display = "none"));
  ids.forEach(id => {
    const panel = document.getElementById(id);
    panel.style.display = 'flex';
  });
}

show('role-screen');

// Обработка событий
document.getElementById('nick-btn').addEventListener("click", () => {
  const nick = document.getElementById('nick-input').value.trim();
  if (!nick) return alert('Введи ник!');
  if(nick !== 'admin'){
    socket.emit('register', nick);
    appState.nick = nick;
    saveState();
  }
});

document.getElementById("role-player").addEventListener("click", () => {
  show("nick-form");
  socket.emit('get nicks');
});

document.getElementById("role-admin").addEventListener("click", () => {
  show("admin-screen", "admin-password", "admin-login");
});

document.getElementById("admin-login").addEventListener("click", () => {
  const pw = document.getElementById("admin-password").value;
  if (!pw) return;

  // отправь пароль на сервер
  socket.emit("admin_auth", pw);
});

document.getElementById('add_nick_form').onsubmit = (e) => {
  e.preventDefault();
  const nick = document.getElementById('add_nick').value.trim();
  if (!nick) return alert('Введи ник!');
  socket.emit('add nick', nick);
  document.getElementById('add_nick').value = '';
};

document.getElementById('remove_nick_form').onsubmit = (e) => {
  e.preventDefault();
  const nick = document.getElementById('remove_nick').value.trim();
  if (!nick) return alert('Введи ник!');
  socket.emit('remove nick', nick);
  document.getElementById('remove_nick').value = '';
};

// обработка ответа сервера
socket.on("admin_auth_ok", () => {
  appState.nick = 'admin';
  saveState();
  socket.emit('register', appState.nick);
});

socket.on("admin_auth_fail", () => {
  alert("Неверный пароль!");
});

socket.on('nick error', (err) => alert(err));

socket.on('registered', (nick) => {
  if(nick === 'admin') {
    show('admin-screen', 'admin-tools', 'chat');
  } else {
    show("chat");
  }
  currentNick = nick;
  document.getElementById('my-nick').textContent = nick;
  document.getElementById('msg-input').disabled = false;
  document.querySelector('button[type=submit]').disabled = false;
});

socket.on('chat history', (history) => {
  console.log('📚 История:', history);
  history.forEach(({with: target, messages}) => {
    chats[target] = messages.map(m => ({from: m.from, msg: m.msg}));
  });
  refreshUserListStyles();
});

socket.on('user list', (userList) => {
    setTimeout(() => {
        updateUserList(userList);
    }, 200);
});

socket.on('send user nicks', (userList) => {
  const select = document.getElementById('nick-input');
  select.innerHTML = '';  // очисти старые опции

  // заполни из userList (массив строк ников)
  userList
    .filter(nick => nick !== 'admin')
    .forEach(nick => {
    const option = document.createElement('option');
    option.value = nick;
    option.textContent = nick;
    select.appendChild(option);
  });
});

function updateUserList(userList) {
  const list = document.getElementById('user-list');
  list.innerHTML = '';
  
  // 🔥 КРАСНЫЕ СВЕРХУ, потом обычные
  const unreadFirst = userList.filter(u => u !== currentNick && unreadChats.has(u));
  const normal = userList.filter(u => u !== currentNick && !unreadChats.has(u));
  const sortedList = [...unreadFirst, ...normal];
  
  sortedList.forEach(user => {
    const li = document.createElement('li');
    li.className = 'user-item';
    li.dataset.user = user;
    li.textContent = user;
    li.onclick = () => openChat(user);
    
    if (unreadChats.has(user) && currentTab !== user) {
      li.classList.add('unread');
    }
    
    list.appendChild(li);
  });
  document.getElementById('count').textContent = userList.length;
}

function openChat(target) {  
  unreadChats.delete(target);
  currentTab = target;
  
  let tab = document.createElement('button');
  tab.id = 'tab';
  tab.dataset.target = target;
  tab.textContent = target;
  const tabs = document.getElementById('tabs');
  tabs.innerHTML = '';
  tabs.appendChild(tab);
  
  socket.emit('user list request');
  
  const msgs = document.getElementById('messages');
  msgs.innerHTML = '';
  if (chats[target]) {
    chats[target].forEach(({from, msg}) => {
      addMessage(`${from}: ${msg}`, from === currentNick ? 'from-me' : 'from-other');
    });
  }
  
  document.getElementById('msg-input').placeholder = `ЛС ${target}:`;
  document.getElementById('msg-input').focus();
  
  refreshUserListStyles();
}

function refreshUserListStyles() { 
  socket.emit('user list request'); // Сервер обновит список с правильным порядком
}

document.getElementById('msg-form').onsubmit = (e) => {
  e.preventDefault();
  if (!currentNick || !currentTab) return;
  
  const msg = document.getElementById('msg-input').value.trim();
  if (!msg) return;
  
  socket.emit('private message', { to: currentTab, msg });
  document.getElementById('msg-input').value = '';
};

socket.on('private message', ({ from, msg, to }) => { 
  const chatUser = from === currentNick ? to : from;
  
  if (!chats[chatUser]) chats[chatUser] = [];
  chats[chatUser].push({from, msg});
  
  if (currentTab === chatUser) {
    addMessage(`${from}: ${msg}`, from === currentNick ? 'from-me' : 'from-other');
  } else {
    unreadChats.add(chatUser);
    
    refreshUserListStyles(); // 🔥 Красные наверх
  }
});

function addMessage(text, className) {
  const div = document.createElement('div');
  div.className = `msg ${className}`;
  div.textContent = text;
  document.getElementById('messages').appendChild(div);
  document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
}
