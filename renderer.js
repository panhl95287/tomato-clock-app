const { ipcRenderer } = require('electron');

// ===== 简易存储 (替代 localStorage) =====
const store = {
  _data: {},
  getItem(key) {
    return this._data[key] || null;
  },
  setItem(key, val) {
    this._data[key] = String(val);
  },
  removeItem(key) {
    delete this._data[key];
  },
};

// ===== 状态管理 =====
const state = {
  config: {
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    cyclesBeforeLongBreak: 4,
    playSound: true,
    autoStartBreak: true,
    autoStartWork: true,
  },
  mode: 'work',
  remainingSeconds: 25 * 60,
  totalSeconds: 25 * 60,
  status: 'idle',
  currentCycle: 1,
  todayCount: 0,
  totalCount: 0,
  totalMinutes: 0,
  timerInterval: null,
  lastDate: null,
};

// ===== DOM 元素 =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  timerDisplay: $('#timerDisplay'),
  cycleInfo: $('#cycleInfo'),
  btnStart: $('#btnStart'),
  btnPause: $('#btnPause'),
  btnReset: $('#btnReset'),
  btnSkip: $('#btnSkip'),
  btnSettings: $('#btnSettings'),
  settingsPanel: $('#settingsPanel'),
  btnCloseSettings: $('#btnCloseSettings'),
  btnMinimize: $('#btnMinimize'),
  btnClose: $('#btnClose'),
  progressFill: $('.progress-ring-fill'),
  progressRingContainer: $('#progressRingContainer'),
  todayCount: $('#todayCount'),
  totalCount: $('#totalCount'),
  totalMinutes: $('#totalMinutes'),
  workDuration: $('#workDuration'),
  shortBreakDuration: $('#shortBreakDuration'),
  longBreakDuration: $('#longBreakDuration'),
  cyclesBeforeLongBreak: $('#cyclesBeforeLongBreak'),
  playSound: $('#playSound'),
  autoStartBreak: $('#autoStartBreak'),
  autoStartWork: $('#autoStartWork'),
  btnSaveSettings: $('#btnSaveSettings'),
  modeTabs: $$('.mode-tab'),
  // 自定义时间
  customTimeOverlay: $('#customTimeOverlay'),
  customMins: $('#customMins'),
  customSecs: $('#customSecs'),
  btnCancelTime: $('#btnCancelTime'),
  btnConfirmTime: $('#btnConfirmTime'),
};

// ===== 初始化 =====
async function init() {
  // 加载配置
  const config = await ipcRenderer.invoke('get-config');
  Object.assign(state.config, config);

  // 加载统计数据
  loadStats();

  // 初始化显示
  setMode('work');
  updateDisplay();
  bindEvents();
}

// ===== 统计持久化 =====
function loadStats() {
  try {
    const raw = store.getItem('tomato-stats');
    const data = raw ? JSON.parse(raw) : {};
    const today = new Date().toISOString().slice(0, 10);

    if (data.lastDate && data.lastDate !== today) {
      state.todayCount = 0;
    } else {
      state.todayCount = data.todayCount || 0;
    }

    state.totalCount = data.totalCount || 0;
    state.totalMinutes = data.totalMinutes || 0;
    state.lastDate = data.lastDate || today;
  } catch (e) {
    state.todayCount = 0;
    state.totalCount = 0;
    state.totalMinutes = 0;
  }
  updateStatsDisplay();
}

function saveStats() {
  const today = new Date().toISOString().slice(0, 10);
  const data = {
    lastDate: today,
    todayCount: state.todayCount,
    totalCount: state.totalCount,
    totalMinutes: state.totalMinutes,
  };
  store.setItem('tomato-stats', JSON.stringify(data));
}

function updateStatsDisplay() {
  els.todayCount.textContent = state.todayCount;
  els.totalCount.textContent = state.totalCount;
  els.totalMinutes.textContent = state.totalMinutes;
}

// ===== 模式切换 =====
function setMode(mode) {
  state.mode = mode;

  els.modeTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });

  let duration;
  switch (mode) {
    case 'work':
      duration = state.config.workDuration;
      break;
    case 'shortBreak':
      duration = state.config.shortBreakDuration;
      break;
    case 'longBreak':
      duration = state.config.longBreakDuration;
      break;
  }

  state.remainingSeconds = duration * 60;
  state.totalSeconds = duration * 60;

  els.progressFill.className = 'progress-ring-fill';
  if (mode === 'shortBreak') {
    els.progressFill.classList.add('break-short');
  } else if (mode === 'longBreak') {
    els.progressFill.classList.add('break-long');
  }

  updateDisplay();
  updateCycleInfo();
}

function updateCycleInfo() {
  if (state.mode === 'work') {
    els.cycleInfo.textContent = `第 ${state.currentCycle} / ${state.config.cyclesBeforeLongBreak} 个番茄`;
  } else {
    const label = state.mode === 'shortBreak' ? '短休息' : '长休息';
    els.cycleInfo.textContent = label;
  }
}

// ===== 显示更新 =====
function updateDisplay() {
  const mins = Math.floor(state.remainingSeconds / 60);
  const secs = state.remainingSeconds % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  els.timerDisplay.textContent = timeStr;

  const modeLabel = state.mode === 'work' ? '专注' : (state.mode === 'shortBreak' ? '短休息' : '长休息');
  document.title = `${timeStr} - ${modeLabel} | 小番茄闹钟`;

  updateProgressRing();
}

function updateProgressRing() {
  const circumference = 2 * Math.PI * 90;
  const progress = state.totalSeconds > 0 ? state.remainingSeconds / state.totalSeconds : 0;
  const offset = circumference * (1 - progress);
  els.progressFill.style.strokeDasharray = circumference;
  els.progressFill.style.strokeDashoffset = offset;
}

// ===== 计时器逻辑 =====
function startTimer() {
  if (state.status === 'running') return;

  state.status = 'running';
  els.btnStart.classList.add('hidden');
  els.btnPause.classList.remove('hidden');

  state.timerInterval = setInterval(() => {
    state.remainingSeconds--;

    if (state.remainingSeconds <= 0) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
      state.status = 'idle';
      onTimerComplete();
      return;
    }

    updateDisplay();
  }, 1000);
}

function pauseTimer() {
  if (state.status !== 'running') return;

  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.status = 'paused';
  els.btnPause.classList.add('hidden');
  els.btnStart.classList.remove('hidden');
  els.btnStart.textContent = '继续';
}

function resetTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.status = 'idle';

  let duration;
  switch (state.mode) {
    case 'work':
      duration = state.config.workDuration;
      break;
    case 'shortBreak':
      duration = state.config.shortBreakDuration;
      break;
    case 'longBreak':
      duration = state.config.longBreakDuration;
      break;
  }

  state.remainingSeconds = duration * 60;
  state.totalSeconds = duration * 60;
  updateDisplay();

  els.btnPause.classList.add('hidden');
  els.btnStart.classList.remove('hidden');
  els.btnStart.textContent = '开始';
}

function skipTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.status = 'idle';
  onTimerComplete();
}

// ===== 计时完成 =====
function onTimerComplete() {
  if (state.config.playSound) {
    playAlarmSound();
  }

  ipcRenderer.send('show-notification', {
    body: state.mode === 'work' ? '专注完成！休息一下吧 🎉' : '休息结束，开始新的专注吧 💪',
  });

  if (state.mode === 'work') {
    state.todayCount++;
    state.totalCount++;
    state.totalMinutes += state.config.workDuration;
    saveStats();
    updateStatsDisplay();

    if (state.currentCycle >= state.config.cyclesBeforeLongBreak) {
      state.currentCycle = 1;
      setMode('longBreak');
      if (state.config.autoStartBreak) {
        setTimeout(() => startTimer(), 500);
      }
    } else {
      state.currentCycle++;
      setMode('shortBreak');
      if (state.config.autoStartBreak) {
        setTimeout(() => startTimer(), 500);
      }
    }
  } else {
    setMode('work');
    if (state.config.autoStartWork) {
      setTimeout(() => startTimer(), 500);
    }
  }

  els.btnPause.classList.add('hidden');
  els.btnStart.classList.remove('hidden');
  els.btnStart.textContent = '开始';
}

// ===== 提示音 =====
function playAlarmSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const playBeep = (time, freq) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
      osc.start(time);
      osc.stop(time + 0.3);
    };
    const now = audioCtx.currentTime;
    playBeep(now, 880);
    playBeep(now + 0.4, 880);
    playBeep(now + 0.8, 1100);
  } catch (e) {
    console.warn('音频播放失败:', e);
  }
}

// ===== 事件绑定 =====
function bindEvents() {
  els.btnMinimize.addEventListener('click', () => {
    ipcRenderer.send('window-minimize');
  });

  els.btnClose.addEventListener('click', () => {
    ipcRenderer.send('window-close');
  });

  els.modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (state.status === 'running') return;
      setMode(tab.dataset.mode);
    });
  });

  els.btnStart.addEventListener('click', () => {
    if (state.status === 'paused') {
      els.btnStart.textContent = '继续';
    }
    startTimer();
  });

  els.btnPause.addEventListener('click', pauseTimer);
  els.btnReset.addEventListener('click', resetTimer);
  els.btnSkip.addEventListener('click', skipTimer);

  els.btnSettings.addEventListener('click', () => {
    els.workDuration.value = state.config.workDuration;
    els.shortBreakDuration.value = state.config.shortBreakDuration;
    els.longBreakDuration.value = state.config.longBreakDuration;
    els.cyclesBeforeLongBreak.value = state.config.cyclesBeforeLongBreak;
    els.playSound.checked = state.config.playSound;
    els.autoStartBreak.checked = state.config.autoStartBreak;
    els.autoStartWork.checked = state.config.autoStartWork;
    els.settingsPanel.classList.remove('hidden');
  });

  els.btnCloseSettings.addEventListener('click', () => {
    els.settingsPanel.classList.add('hidden');
  });

  els.btnSaveSettings.addEventListener('click', saveSettings);

  // 自定义时间
  els.progressRingContainer.addEventListener('click', () => {
    if (state.status === 'running') return;
    const mins = Math.floor(state.remainingSeconds / 60);
    const secs = state.remainingSeconds % 60;
    els.customMins.value = mins || 25;
    els.customSecs.value = secs;
    els.customTimeOverlay.classList.remove('hidden');
    els.customMins.focus();
    els.customMins.select();
  });

  els.btnCancelTime.addEventListener('click', () => {
    els.customTimeOverlay.classList.add('hidden');
  });

  els.btnConfirmTime.addEventListener('click', () => {
    const mins = parseInt(els.customMins.value) || 0;
    const secs = parseInt(els.customSecs.value) || 0;
    const total = mins * 60 + secs;
    if (total <= 0 || total > 180 * 60) return;

    state.remainingSeconds = total;
    state.totalSeconds = total;
    updateDisplay();
    els.customTimeOverlay.classList.add('hidden');
  });

  // 回车确认
  els.customTimeOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.btnConfirmTime.click();
    if (e.key === 'Escape') els.btnCancelTime.click();
  });
}

// ===== 保存设置 =====
async function saveSettings() {
  state.config.workDuration = parseInt(els.workDuration.value) || 25;
  state.config.shortBreakDuration = parseInt(els.shortBreakDuration.value) || 5;
  state.config.longBreakDuration = parseInt(els.longBreakDuration.value) || 15;
  state.config.cyclesBeforeLongBreak = parseInt(els.cyclesBeforeLongBreak.value) || 4;
  state.config.playSound = els.playSound.checked;
  state.config.autoStartBreak = els.autoStartBreak.checked;
  state.config.autoStartWork = els.autoStartWork.checked;

  await ipcRenderer.invoke('save-config', state.config);

  if (state.status !== 'running') {
    setMode(state.mode);
  }

  els.settingsPanel.classList.add('hidden');
}

// ===== 启动 =====
init();
