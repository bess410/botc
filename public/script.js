const socket = io();
let currentNick = null;
let chats = {};
let currentTab = null;
let unreadChats = new Set();
let tabOrder = []; // Порядок вкладок (LRU)

document.getElementById('nick-btn').onclick = () => {
  const nick = document.getElementById('nick-input').value.trim();
  if (!nick) return alert('Введи ник!');
  socket.emit('register', nick);
};

socket.on('nick error', (err) => alert(err));

socket.on('registered', (nick) => {
  currentNick = nick;
  document.getElementById('my-nick').textContent = nick;
  document.getElementById('nick-form').style.display = 'none';
  document.getElementById('chat').style.display = 'flex';
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
      li.style.background = '#ff4444';
      li.style.color = 'white';
      li.classList.add('unread'); // Для CSS
    }
    
    list.appendChild(li);
  });
  document.getElementById('count').textContent = userList.length;
}

function openChat(target) {  
  unreadChats.delete(target);
  currentTab = target;
  
  // LRU: обновляем порядок вкладок
  const tabIndex = tabOrder.indexOf(target);
  if (tabIndex > -1) {
    tabOrder.splice(tabIndex, 1); // Удаляем старое
  }
  tabOrder.unshift(target); // В начало
  
  // Закрываем лишние вкладки
  while (tabOrder.length > 3) {
    const closedTab = tabOrder.pop();
    // delete chats[closedTab];
    document.querySelector(`.tab[data-target="${closedTab}"]`)?.remove();
  }
  
  // Вкладки UI
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  
  let tab = Array.from(document.querySelectorAll('.tab')).find(t => t.dataset.target === target);
  if (!tab) {
    tab = document.createElement('button');
    tab.className = 'tab active';
    tab.dataset.target = target;
    tab.textContent = target;
    tab.onclick = () => openChat(target);
    document.getElementById('tabs').appendChild(tab);
  } else {
    tab.classList.add('active');
    tab.classList.remove('unread');
  }
  
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
    
    const tab = Array.from(document.querySelectorAll('.tab')).find(t => t.dataset.target === chatUser);
    if (tab) {
      tab.classList.add('unread');
    }
    
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
