// ─── Firebase 초기화 및 설정 ───
const firebaseConfig = {
  apiKey: "AIzaSyBMNqF6Uc7YncfP8beK2eJwIadksBgTVqU",
  authDomain: "run-puma-fam.firebaseapp.com",
  projectId: "run-puma-fam",
  storageBucket: "run-puma-fam.firebasestorage.app",
  messagingSenderId: "865249069550",
  appId: "1:865249069550:web:c3328b841a55eb6675a6ff"
};

// 파이어베이스 앱이 중복 실행되지 않도록 방어 코드
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// ─── RUN PUMA FAM · Shared App Logic ───
const APP = {
  GOAL_KM: 2026,
  MAX_DAILY_KM: 50,
  TEAMS: [
    { id: 0, name: "HALF A팀", color: "#E8FF47", bg: "#1a1a0d", abbr: "HA" },
    { id: 1, name: "HALF B팀", color: "#47FFD4", bg: "#0d1a17", abbr: "HB" },
    { id: 2, name: "10KM C팀", color: "#FF6B47", bg: "#1a0f0d", abbr: "CA" },
    { id: 3, name: "10KM D팀", color: "#C447FF", bg: "#150d1a", abbr: "DA" },
  ],
  WEEKLY_MISSIONS: [
    { week: 1, desc: "조깅 10km" },
    { week: 2, desc: "80분 조깅" },
    { week: 3, desc: "지속주 10km" },
    { week: 4, desc: "100분 조깅" },
    { week: 5, desc: "거리주 15km" },
    { week: 6, desc: "5km 기록회" }
  ],

  // 서버에서 불러온 데이터를 담아둘 로컬 바구니
  state: {
    users: [],
    records: [],
    missions: {},
    seeded: false
  },

  // 앱 실행 시 실시간 DB 구독
  init() {
    db.ref().on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        this.state.users = data.users || [];
        this.state.records = data.records || [];
        this.state.missions = data.missions || {};
        this.state.seeded = data.seeded || false;
      } else {
        if (!this.state.seeded) this.seedDemo();
      }

      // 데이터가 서버에서 업데이트될 때마다 화면 자동 렌더링!
      if (typeof renderAll === 'function') renderAll();
      if (typeof renderStats === 'function') { renderStats(); renderCards(); renderMissions(); }
    });
  },

  seedDemo() {
    db.ref().set({ users: [], records: [], missions: {}, seeded: true });
    localStorage.removeItem('rtcs_currentUser');
  },

  getUsers() { return this.state.users || []; },
  getRecords() { return this.state.records || []; },
  getMissions() { return this.state.missions || {}; },
  
  // 현재 로그인 상태는 기기(PC/모바일)마다 달라야 하므로 로컬 스토리지 유지
  getCurrentUserId() { return localStorage.getItem("rtcs_currentUser"); },
  setCurrentUserId(id) { 
    if(id === null) localStorage.removeItem("rtcs_currentUser");
    else localStorage.setItem("rtcs_currentUser", id); 
  },
  getCurrentUser() { 
    const id = this.getCurrentUserId(); 
    return this.getUsers().find(u => u.id === id) || null; 
  },
  
  getApprovedRecords() { return this.getRecords().filter(r => r.status === "approved"); },
  
  getTeamStats() {
    const users = this.getUsers(); const approved = this.getApprovedRecords();
    return this.TEAMS.map(team => {
      const members = users.filter(u => u.teamId === team.id);
      const memberIds = members.map(u => u.id);
      const records = approved.filter(r => memberIds.includes(r.userId));
      const totalKm = records.reduce((s, r) => s + r.km, 0);
      const participantCount = new Set(records.map(r => r.userId)).size;
      return { ...team, totalKm: Math.round(totalKm * 10) / 10, memberCount: members.length, participantCount, recordCount: records.length };
    });
  },

  getTeamScores() {
    const stats = this.getTeamStats(); const totalKm = stats.reduce((s, t) => s + t.totalKm, 0) || 1;
    return stats.map(t => {
      const distScore = Math.round((t.totalKm / totalKm) * 50 * 10) / 10;
      const partRate = t.memberCount > 0 ? t.participantCount / t.memberCount : 0;
      const partScore = Math.round(partRate * 20 * 10) / 10;
      const missionScore = t.totalKm >= 50 ? 20 : Math.round((t.totalKm / 50) * 20 * 10) / 10;
      const bonusScore = (t.memberCount > 0 && t.participantCount >= t.memberCount) ? 10 : 0;
      const total = Math.round((distScore + partScore + missionScore + bonusScore) * 10) / 10;
      return { ...t, distScore, partScore, missionScore, bonusScore, total };
    }).sort((a, b) => b.total - a.total);
  },

  getTotalKm() { return Math.round(this.getApprovedRecords().reduce((s, r) => s + r.km, 0) * 10) / 10; },
  getUserRecords(userId) { return this.getRecords().filter(r => r.userId === userId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)); },
  
  registerUser(name, phone, teamId) {
    const users = this.getUsers();
    if (users.find(u => u.name === name && u.phone === phone.slice(-4))) return { ok: false, msg: "이미 등록된 참가자입니다." };
    const id = "u" + Date.now();
    const user = { id, name, phone: phone.slice(-4), teamId: parseInt(teamId), joinDate: new Date().toISOString().slice(0,10) };
    
    users.push(user); 
    db.ref('users').set(users); // 서버에 저장
    this.setCurrentUserId(id); 
    return { ok: true, user };
  },
  
  loginUser(name, phone) {
    const users = this.getUsers();
    const user = users.find(u => u.name === name && u.phone === phone.slice(-4));
    if (!user) return { ok: false, msg: "이름 또는 연락처가 일치하지 않아요." };
    this.setCurrentUserId(user.id); 
    return { ok: true, user };
  },

  submitRecord(userId, date, km, screenshotName) {
    const records = this.getRecords();
    const existing = records.find(r => r.userId === userId && r.date === date);
    if (existing) return { ok: false, msg: "해당 날짜에 이미 제출한 기록이 있어요." };
    const flagAbnormal = km > this.MAX_DAILY_KM;
    const id = "r" + Date.now();
    const newRecord = {
      id, userId, date, km, screenshot: screenshotName || "screenshot.jpg",
      status: "pending", submittedAt: new Date().toISOString(), reviewedAt: null, note: "", flagAbnormal
    };
    records.push(newRecord);
    db.ref('records').set(records); // 서버에 저장
    return { ok: true, record: newRecord, flagAbnormal };
  },

  reviewRecord(recordId, action, note = "") {
    const records = this.getRecords();
    const idx = records.findIndex(r => r.id === recordId);
    if (idx === -1) return false;
    records[idx].status = action;
    records[idx].reviewedAt = new Date().toISOString();
    records[idx].note = note;
    db.ref('records').set(records);
    return true;
  },

  toggleMission(userId, week) {
    const missions = this.getMissions();
    if (!missions[userId]) missions[userId] = [];
    const idx = missions[userId].indexOf(week);
    if (idx === -1) missions[userId].push(week);
    else missions[userId].splice(idx, 1);
    db.ref('missions').set(missions);
  },

  deleteRecordsByArray(newArr) {
    db.ref('records').set(newArr);
  },

  getCurrentWeek() {
    const start = new Date("2026-03-02");
    const now = new Date();
    return Math.min(6, Math.max(1, Math.ceil((now - start) / (7 * 86400000))));
  }
};