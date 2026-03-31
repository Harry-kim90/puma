// ─── RUN TO COMPLETE SEOUL · Shared App Logic ───────────────────────────────

const APP = {
  GOAL_KM: 2026,
  MAX_DAILY_KM: 50,

  TEAMS: [
    { id: 0, name: "HALF A팀", color: "#E8FF47", bg: "#1a1a0d", abbr: "HA" },
    { id: 1, name: "HALF B팀", color: "#47FFD4", bg: "#0d1a17", abbr: "HB" },
    { id: 2, name: "10KM C팀", color: "#FF6B47", bg: "#1a0f0d", abbr: "CA" },
    { id: 3, name: "10KM D팀", color: "#C447FF", bg: "#150d1a", abbr: "DA" },
  ],

  LANDMARKS: [],

  WEEKLY_MISSIONS: [
    { week: 1, m1: "팀원 전원 1회 이상 제출", m2: "팀 총 거리 50km 이상", bonus: null },
    { week: 2, m1: "주 3회 이상 러닝 (팀원 과반)", m2: "팀 총 거리 80km 이상", bonus: "참여율 100% +5점" },
    { week: 3, m1: "팀 참여율 70% 이상", m2: "팀 총 거리 100km 이상", bonus: null },
    { week: 4, m1: "팀원 과반 연속 3일 러닝", m2: "팀 총 거리 120km 이상", bonus: "연속 참여 +5점" },
    { week: 5, m1: "팀 참여율 80% 이상", m2: "팀 총 거리 150km 이상", bonus: null },
    { week: 6, m1: "전원 최종 주 참여", m2: "팀 총 거리 180km 이상", bonus: "완주 보너스 +10점" },
  ],

  // ── Storage helpers ──────────────────────────────────────────────────────
  getData(key, fallback) {
    try { const v = localStorage.getItem("rtcs_" + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  setData(key, val) {
    try { localStorage.setItem("rtcs_" + key, JSON.stringify(val)); } catch {}
  },

  // ── Seed demo data if empty ──────────────────────────────────────────────
  init() {
    if (!this.getData("seeded", false)) {
      this.seedDemo();
      this.setData("seeded", true);
    }
  },

  seedDemo() {
    this.setData("users", []);
    this.setData("records", []);
    this.setData("currentUser", null);
  },

  // ── Computed getters ─────────────────────────────────────────────────────
  getUsers()   { return this.getData("users",   []); },
  getRecords() { return this.getData("records", []); },
  getCurrentUserId() { return this.getData("currentUser", null); },
  getCurrentUser() {
    const id = this.getCurrentUserId();
    return this.getUsers().find(u => u.id === id) || null;
  },

  getApprovedRecords() {
    return this.getRecords().filter(r => r.status === "approved");
  },

  getTeamStats() {
    const users = this.getUsers();
    const approved = this.getApprovedRecords();
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
    const stats = this.getTeamStats();
    const totalKm = stats.reduce((s, t) => s + t.totalKm, 0) || 1;
    return stats.map(t => {
      const distScore = Math.round((t.totalKm / totalKm) * 50 * 10) / 10;
      const partRate = t.memberCount > 0 ? t.participantCount / t.memberCount : 0;
      const partScore = Math.round(partRate * 20 * 10) / 10;
      const missionScore = t.totalKm >= 50 ? 20 : Math.round((t.totalKm / 50) * 20 * 10) / 10;
      
      // [수정된 부분] 팀원이 최소 1명 이상일 때만 보너스 점수를 주도록 방어 코드 추가
      const bonusScore = (t.memberCount > 0 && t.participantCount >= t.memberCount) ? 10 : 0;
      
      const total = Math.round((distScore + partScore + missionScore + bonusScore) * 10) / 10;
      return { ...t, distScore, partScore, missionScore, bonusScore, total };
    }).sort((a, b) => b.total - a.total);
  },

  getTotalKm() {
    return Math.round(this.getApprovedRecords().reduce((s, r) => s + r.km, 0) * 10) / 10;
  },

  getUserRecords(userId) {
    return this.getRecords().filter(r => r.userId === userId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  },

  submitRecord(userId, date, km, screenshotName) {
    const records = this.getRecords();
    const existing = records.find(r => r.userId === userId && r.date === date);
    if (existing) return { ok: false, msg: "해당 날짜에 이미 제출한 기록이 있어요." };
    const flagAbnormal = km > this.MAX_DAILY_KM;
    const id = "r" + Date.now();
    const newRecord = {
      id, userId, date, km,
      screenshot: screenshotName || "screenshot.jpg",
      status: "pending",
      submittedAt: new Date().toISOString(),
      reviewedAt: null, note: "", flagAbnormal
    };
    records.push(newRecord);
    this.setData("records", records);
    return { ok: true, record: newRecord, flagAbnormal };
  },

  reviewRecord(recordId, action, note = "") {
    const records = this.getRecords();
    const idx = records.findIndex(r => r.id === recordId);
    if (idx === -1) return false;
    records[idx].status = action; // "approved" | "rejected"
    records[idx].reviewedAt = new Date().toISOString();
    records[idx].note = note;
    this.setData("records", records);
    return true;
  },

  registerUser(name, phone, teamId) {
    const users = this.getUsers();
    if (users.find(u => u.name === name && u.phone === phone.slice(-4))) {
      return { ok: false, msg: "이미 등록된 참가자입니다." };
    }
    const id = "u" + Date.now();
    const token = "tok_" + id;
    const user = { id, name, phone: phone.slice(-4), teamId: parseInt(teamId), joinDate: new Date().toISOString().slice(0,10), token };
    users.push(user);
    this.setData("users", users);
    this.setData("currentUser", id);
    return { ok: true, user };
  },

  loginUser(name, phone) {
    const users = this.getUsers();
    const user = users.find(u => u.name === name && u.phone === phone.slice(-4));
    if (!user) return { ok: false, msg: "이름 또는 연락처가 일치하지 않아요." };
    this.setData("currentUser", user.id);
    return { ok: true, user };
  },

  formatKm(km) { return km % 1 === 0 ? km.toFixed(0) + "km" : km.toFixed(1) + "km"; },
  formatDate(d) { const dt = new Date(d); return `${dt.getMonth()+1}/${dt.getDate()}`; },
  getCurrentWeek() {
    const start = new Date("2026-03-02");
    const now = new Date();
    return Math.min(6, Math.max(1, Math.ceil((now - start) / (7 * 86400000))));
  },
};