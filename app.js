// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateEmail,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  push,
  onValue,
  remove,
  increment,
  serverTimestamp,
  query,
  orderByChild,
  equalTo
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Import konfigurasi dari api.js
import { firebaseConfig } from "./api.js";

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ---------- STATE GLOBAL ----------
let currentUser = null;
let userData = null;
let userRole = 'user'; // 'superadmin', 'admin', 'user'
let isAdmin = false;
let globalSettings = { rewardPerView: 1, referralThreshold: 5, exchangeRate: 10 };

// Elemen DOM
const appContainer = document.getElementById('appContainer');
const headerUserArea = document.getElementById('headerUserArea');
const toastEl = document.getElementById('pointToast');
const toastMsg = document.getElementById('toastMessage');

// Fungsi utilitas
function showToast(msg, isError = false) {
  toastMsg.textContent = msg;
  toastEl.style.background = isError ? '#b45309' : '#1e293b';
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function generateReferralCode() {
  return 'TAB' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Load pengaturan global
async function loadSettings() {
  const snap = await get(ref(db, 'settings'));
  if (snap.exists()) globalSettings = snap.val();
}

// ---------- AUTENTIKASI & HEADER ----------
function updateHeaderUI() {
  if (currentUser) {
    const pointDisplay = userData?.points || 0;
    headerUserArea.innerHTML = `
      <div class="user-badge">
        <span><i class="fas fa-user-circle"></i> ${userData?.username || currentUser.email}</span>
        ${userRole !== 'user' ? `<span class="badge ${userRole === 'superadmin' ? 'badge-warning' : ''}">${userRole}</span>` : ''}
        <span class="point-badge"><i class="fas fa-coins"></i> ${pointDisplay} Poin</span>
        <button class="btn btn-outline btn-sm" id="logoutBtn"><i class="fas fa-sign-out-alt"></i></button>
      </div>
    `;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await signOut(auth);
    });
  } else {
    headerUserArea.innerHTML = `<a href="#" class="btn" id="showLoginBtn"><i class="fas fa-sign-in-alt"></i> Masuk / Daftar</a>`;
    document.getElementById('showLoginBtn').addEventListener('click', (e) => {
      e.preventDefault();
      renderAuth();
    });
  }
}

// Observer status autentikasi
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const userRef = ref(db, `users/${user.uid}`);
    const snap = await get(userRef);
    if (snap.exists()) {
      userData = snap.val();
      userRole = userData.role || 'user';
      isAdmin = (userRole === 'admin' || userRole === 'superadmin');
    } else {
      // Buat data user baru
      userData = {
        email: user.email,
        username: user.email.split('@')[0],
        points: 0,
        role: 'user',
        referralCode: generateReferralCode(),
        referralClicks: 0,
        referralRewardGiven: false,
        createdAt: serverTimestamp()
      };
      await set(userRef, userData);
      userRole = 'user';
      isAdmin = false;
    }
    await loadSettings();
    updateHeaderUI();
    router();
  } else {
    currentUser = null;
    userData = null;
    userRole = 'user';
    isAdmin = false;
    updateHeaderUI();
    renderAuth();
  }
});

// ---------- ROUTER ----------
function router() {
  const hash = window.location.hash.slice(1) || (isAdmin ? 'admin' : 'home');
  if (!currentUser) {
    renderAuth();
    return;
  }
  if (isAdmin) {
    if (hash === 'admin' || hash === '') renderAdminDashboard();
    else if (hash === 'admin/articles') renderAdminArticles();
    else if (hash === 'admin/users') renderAdminUsers();
    else if (hash === 'admin/admins') renderAdminAdmins();
    else if (hash === 'admin/settings') renderAdminSettings();
    else renderAdminDashboard();
  } else {
    if (hash === 'home' || hash === '') renderUserHome();
    else if (hash === 'profile') renderUserProfile();
    else if (hash === 'referral') renderUserReferral();
    else if (hash === 'withdraw') renderUserWithdraw();
    else if (hash === 'history') renderUserHistory();
    else if (hash.startsWith('article/')) renderArticleDetail(hash.split('/')[1]);
    else renderUserHome();
  }
}

window.addEventListener('hashchange', router);

// ---------- HALAMAN LOGIN/REGISTER ----------
function renderAuth() {
  appContainer.innerHTML = `
    <div class="wrapper" style="max-width:480px; margin:40px auto;">
      <div class="card">
        <h2 style="margin-bottom:24px; text-align:center;"><i class="fas fa-lock"></i> Akses TabLink</h2>
        <div id="authForm">
          <div class="form-group"><label>Email</label><input type="email" id="authEmail" placeholder="email@contoh.com"></div>
          <div class="form-group"><label>Password</label><input type="password" id="authPassword" placeholder="********"></div>
          <div class="form-group" id="usernameField" style="display:none;"><label>Username</label><input type="text" id="authUsername" placeholder="Nama pengguna"></div>
          <button class="btn btn-block" id="authActionBtn">Masuk</button>
          <p style="margin-top:20px; text-align:center;">
            <span id="toggleAuthText">Belum punya akun?</span> <a href="#" id="toggleAuthLink">Daftar</a>
          </p>
          <p style="text-align:center; margin-top:12px;"><a href="#" id="forgotPasswordLink">Lupa password?</a></p>
        </div>
      </div>
    </div>
  `;
  
  let mode = 'login';
  const actionBtn = document.getElementById('authActionBtn');
  const toggleLink = document.getElementById('toggleAuthLink');
  const toggleText = document.getElementById('toggleAuthText');
  const usernameField = document.getElementById('usernameField');
  
  function setMode(m) {
    mode = m;
    if (mode === 'login') {
      actionBtn.textContent = 'Masuk';
      toggleText.textContent = 'Belum punya akun?';
      toggleLink.textContent = 'Daftar';
      usernameField.style.display = 'none';
    } else {
      actionBtn.textContent = 'Daftar';
      toggleText.textContent = 'Sudah punya akun?';
      toggleLink.textContent = 'Masuk';
      usernameField.style.display = 'block';
    }
  }
  setMode('login');
  
  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    setMode(mode === 'login' ? 'register' : 'login');
  });
  
  document.getElementById('forgotPasswordLink').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    if (!email) { showToast('Masukkan email terlebih dahulu', true); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('Email reset password telah dikirim');
    } catch (err) { showToast(err.message, true); }
  });

  actionBtn.addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    if (!email || !password) { showToast('Email dan password wajib', true); return; }
    try {
      if (mode === 'register') {
        const username = document.getElementById('authUsername').value.trim();
        if (!username) { showToast('Username wajib', true); return; }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await set(ref(db, `users/${cred.user.uid}`), {
          email, username, points: 0, role: 'user',
          referralCode: generateReferralCode(), referralClicks: 0, referralRewardGiven: false,
          createdAt: serverTimestamp()
        });
        showToast('Akun berhasil dibuat!');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) { showToast(err.message, true); }
  });
}

// ---------- DASHBOARD USER ----------
function renderSidebar(active) {
  return `
    <div class="sidebar-menu">
      <a href="#home" class="${active === 'home' ? 'active' : ''}"><i class="fas fa-home"></i> Beranda</a>
      <a href="#profile" class="${active === 'profile' ? 'active' : ''}"><i class="fas fa-user"></i> Profil Saya</a>
      <a href="#referral" class="${active === 'referral' ? 'active' : ''}"><i class="fas fa-users"></i> Undang Teman</a>
      <a href="#withdraw" class="${active === 'withdraw' ? 'active' : ''}"><i class="fas fa-wallet"></i> Tukar Koin</a>
      <a href="#history" class="${active === 'history' ? 'active' : ''}"><i class="fas fa-history"></i> Riwayat</a>
    </div>
  `;
}

function renderUserHome() {
  appContainer.innerHTML = `
    <div class="dashboard-layout">
      ${renderSidebar('home')}
      <div class="main-panel" id="userHomePanel">Memuat artikel...</div>
    </div>
  `;
  loadArticlesForHome();
}

async function loadArticlesForHome() {
  const panel = document.getElementById('userHomePanel');
  panel.innerHTML = '<div class="loading-spinner"></div>';
  const articlesRef = ref(db, 'articles');
  onValue(articlesRef, (snap) => {
    let html = `<h2 style="margin-bottom:20px;"><i class="fas fa-newspaper"></i> Artikel Terbaru</h2>`;
    if (snap.exists()) {
      const articles = Object.entries(snap.val())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      articles.forEach(art => {
        html += `
          <div class="article-card">
            <img class="article-thumb" src="${art.thumbnail || 'https://picsum.photos/400/200'}" alt="${art.title}">
            <div class="article-body">
              <span class="badge">${art.category || 'Umum'}</span>
              <h3 style="margin:12px 0 8px;">${art.title}</h3>
              <p style="color:#64748b; margin-bottom:16px;">${art.summary || ''}</p>
              <a href="#article/${art.id}" class="btn btn-outline btn-sm">Baca <i class="fas fa-arrow-right"></i></a>
            </div>
          </div>
        `;
      });
    } else {
      html += '<p>Belum ada artikel.</p>';
    }
    panel.innerHTML = html;
  }, { onlyOnce: false });
}

function renderArticleDetail(articleId) {
  appContainer.innerHTML = `<div class="wrapper"><div class="card" style="max-width:900px; margin:20px auto;" id="articleDetail">Memuat...</div></div>`;
  const artRef = ref(db, `articles/${articleId}`);
  get(artRef).then(snap => {
    if (!snap.exists()) {
      appContainer.innerHTML = '<p>Artikel tidak ditemukan</p>';
      return;
    }
    const art = snap.val();
    const html = `
      <a href="#home" style="margin-bottom:20px;display:inline-block;"><i class="fas fa-arrow-left"></i> Kembali</a>
      <h1>${art.title}</h1>
      <div style="display:flex; gap:16px; color:#64748b; margin:12px 0;">
        <span><i class="far fa-calendar"></i> ${art.date || ''}</span>
        <span><i class="far fa-user"></i> ${art.author}</span>
      </div>
      <img src="${art.thumbnail || 'https://picsum.photos/800/400'}" style="width:100%; border-radius:20px; margin:20px 0;">
      <div style="font-size:1.1rem; line-height:1.7;">${art.content || ''}</div>
      <div class="ad-placeholder">Iklan Google AdSense</div>
      <div style="display:flex; gap:12px; margin:20px 0;">
        <button class="btn btn-outline" id="shareFb"><i class="fab fa-facebook"></i> Share</button>
        <button class="btn btn-outline" id="shareWa"><i class="fab fa-whatsapp"></i> Share</button>
      </div>
      <div style="background:#fef9c3; padding:20px; border-radius:20px; display:flex; align-items:center; justify-content:space-between;">
        <span><i class="fas fa-play-circle"></i> <strong>Tonton video dapat ${globalSettings.rewardPerView} poin</strong></span>
        <button class="btn" id="watchVideoBtn"><i class="fas fa-eye"></i> Tonton & Dapat Poin</button>
      </div>
    `;
    document.getElementById('articleDetail').innerHTML = html;
    document.getElementById('watchVideoBtn').addEventListener('click', () => {
      window.open('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1', '_blank', 'width=560,height=315');
      addPoints(globalSettings.rewardPerView, `+${globalSettings.rewardPerView} Poin`);
    });
    document.getElementById('shareFb').addEventListener('click', () => window.open(`https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}`));
    document.getElementById('shareWa').addEventListener('click', () => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(location.href)}`));
  });
}

async function addPoints(amount, msg) {
  if (!currentUser) return;
  const userRef = ref(db, `users/${currentUser.uid}`);
  await update(userRef, { points: increment(amount) });
  const historyRef = ref(db, `users/${currentUser.uid}/history`);
  await push(historyRef, {
    type: 'earn',
    amount,
    description: msg,
    timestamp: serverTimestamp()
  });
  showToast(msg);
}

function renderUserProfile() {
  appContainer.innerHTML = `
    <div class="dashboard-layout">
      ${renderSidebar('profile')}
      <div class="main-panel">
        <div class="card">
          <h3><i class="fas fa-user-edit"></i> Edit Profil</h3>
          <form id="profileForm">
            <div class="form-group"><label>Username</label><input type="text" id="profUsername" value="${userData.username || ''}"></div>
            <div class="form-group"><label>Email</label><input type="email" id="profEmail" value="${currentUser.email}" disabled></div>
            <div class="form-group"><label>Password Baru (kosongkan jika tidak diubah)</label><input type="password" id="profPassword"></div>
            <button type="submit" class="btn"><i class="fas fa-save"></i> Simpan Perubahan</button>
          </form>
        </div>
      </div>
    </div>
  `;
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newUsername = document.getElementById('profUsername').value.trim();
    const newPassword = document.getElementById('profPassword').value;
    try {
      if (newUsername && newUsername !== userData.username) {
        await update(ref(db, `users/${currentUser.uid}`), { username: newUsername });
      }
      if (newPassword) {
        await updatePassword(currentUser, newPassword);
      }
      showToast('Profil berhasil diperbarui');
      router();
    } catch (err) { showToast(err.message, true); }
  });
}

function renderUserReferral() {
  const refCode = userData.referralCode || generateReferralCode();
  const refLink = `${window.location.origin}${window.location.pathname}?ref=${refCode}`;
  appContainer.innerHTML = `
    <div class="dashboard-layout">
      ${renderSidebar('referral')}
      <div class="main-panel">
        <div class="card">
          <h3><i class="fas fa-link"></i> Kode Referral Anda</h3>
          <div style="background:#f1f5f9; padding:16px; border-radius:16px; margin:20px 0;">
            <code style="font-size:1.4rem;">${refCode}</code>
            <button class="btn btn-sm btn-outline" id="copyRefBtn" style="margin-left:12px;"><i class="fas fa-copy"></i> Salin</button>
          </div>
          <p>Bagikan link: <input type="text" value="${refLink}" readonly style="width:100%; padding:10px; border-radius:40px; border:1px solid #ccc;" id="refLinkInput"></p>
          <button class="btn btn-outline btn-sm" id="simulateReferralClickBtn" style="margin-top:16px;"><i class="fas fa-user-plus"></i> Simulasi Klik Teman</button>
          <p class="badge" style="margin-top:16px;">Klik teman: ${userData.referralClicks || 0} / ${globalSettings.referralThreshold}</p>
          <hr style="margin:24px 0;">
          <h4>Teman yang Diundang</h4>
          <div id="referredList">Memuat...</div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('copyRefBtn').addEventListener('click', () => {
    navigator.clipboard?.writeText(refCode);
    showToast('Kode disalin');
  });
  document.getElementById('simulateReferralClickBtn').addEventListener('click', async () => {
    if (userData.referralRewardGiven) {
      showToast('Reward referral sudah diklaim');
      return;
    }
    const newClicks = (userData.referralClicks || 0) + 1;
    await update(ref(db, `users/${currentUser.uid}`), { referralClicks: newClicks });
    if (newClicks >= globalSettings.referralThreshold && !userData.referralRewardGiven) {
      await update(ref(db, `users/${currentUser.uid}`), { referralRewardGiven: true });
      addPoints(2, '+2 Poin dari referral');
    } else {
      showToast(`Klik teman: ${newClicks}/${globalSettings.referralThreshold}`);
    }
  });
  const refQuery = query(ref(db, 'users'), orderByChild('referredBy'), equalTo(refCode));
  onValue(refQuery, (snap) => {
    const listDiv = document.getElementById('referredList');
    if (snap.exists()) {
      let html = '<ul>';
      snap.forEach(child => {
        const u = child.val();
        html += `<li>${u.username || u.email} - ${u.points || 0} poin</li>`;
      });
      html += '</ul>';
      listDiv.innerHTML = html;
    } else {
      listDiv.innerHTML = '<p>Belum ada teman yang mendaftar.</p>';
    }
  });
}

function renderUserWithdraw() {
  appContainer.innerHTML = `
    <div class="dashboard-layout">
      ${renderSidebar('withdraw')}
      <div class="main-panel">
        <div class="card">
          <h3><i class="fas fa-exchange-alt"></i> Tukar Koin ke Saldo</h3>
          <p>Saldo poin Anda: <strong>${userData.points || 0}</strong></p>
          <p>Nilai tukar: 1 poin = Rp ${globalSettings.exchangeRate}</p>
          <div class="form-group"><label>Jumlah Poin</label><input type="number" id="withdrawAmount" min="100" max="${userData.points || 0}" value="100"></div>
          <button class="btn" id="submitWithdrawBtn"><i class="fas fa-paper-plane"></i> Ajukan Penarikan</button>
          <p class="ad-placeholder" style="margin-top:20px;">Iklan / Info Penarikan</p>
        </div>
      </div>
    </div>
  `;
  document.getElementById('submitWithdrawBtn').addEventListener('click', async () => {
    const amount = parseInt(document.getElementById('withdrawAmount').value);
    if (amount < 100) { showToast('Minimal penarikan 100 poin', true); return; }
    if (amount > (userData.points || 0)) { showToast('Poin tidak mencukupi', true); return; }
    const withdrawRef = ref(db, `users/${currentUser.uid}/withdrawals`);
    await push(withdrawRef, {
      amount,
      status: 'pending',
      requestedAt: serverTimestamp()
    });
    await update(ref(db, `users/${currentUser.uid}`), { points: increment(-amount) });
    showToast(`Pengajuan penarikan ${amount} poin berhasil`);
    router();
  });
}

function renderUserHistory() {
  appContainer.innerHTML = `
    <div class="dashboard-layout">
      ${renderSidebar('history')}
      <div class="main-panel">
        <div class="card">
          <h3><i class="fas fa-clock"></i> Riwayat Poin & Penarikan</h3>
          <div id="historyList">Memuat...</div>
        </div>
      </div>
    </div>
  `;
  const historyRef = ref(db, `users/${currentUser.uid}/history`);
  onValue(historyRef, (snap) => {
    const listDiv = document.getElementById('historyList');
    if (snap.exists()) {
      let html = '<table class="table"><tr><th>Tanggal</th><th>Deskripsi</th><th>Jumlah</th></tr>';
      const entries = Object.values(snap.val()).sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
      entries.forEach(e => {
        const date = e.timestamp ? new Date(e.timestamp).toLocaleString() : '-';
        html += `<tr><td>${date}</td><td>${e.description}</td><td>${e.amount > 0 ? '+' : ''}${e.amount}</td></tr>`;
      });
      html += '</table>';
      listDiv.innerHTML = html;
    } else {
      listDiv.innerHTML = '<p>Belum ada riwayat.</p>';
    }
  });
}

// ---------- DASHBOARD ADMIN ----------
function renderAdminSidebar(active) {
  const isSuperAdmin = userRole === 'superadmin';
  return `
    <div class="sidebar-menu">
      <a href="#admin" class="${active === 'dashboard' ? 'active' : ''}"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
      <a href="#admin/articles" class="${active === 'articles' ? 'active' : ''}"><i class="fas fa-newspaper"></i> Kelola Artikel</a>
      <a href="#admin/users" class="${active === 'users' ? 'active' : ''}"><i class="fas fa-users-cog"></i> Kelola Pengguna</a>
      ${isSuperAdmin ? `
        <a href="#admin/admins" class="${active === 'admins' ? 'active' : ''}"><i class="fas fa-user-shield"></i> Kelola Admin</a>
        <a href="#admin/settings" class="${active === 'settings' ? 'active' : ''}"><i class="fas fa-cog"></i> Pengaturan</a>
      ` : ''}
      <a href="#home"><i class="fas fa-eye"></i> Lihat Situs</a>
    </div>
  `;
}

function renderAdminDashboard() {
  appContainer.innerHTML = `
    <div class="dashboard-layout">
      ${renderAdminSidebar('dashboard')}
      <div class="main-panel">
        <div class="grid-3">
          <div class="stat-card"><h3>Total Pengguna</h3><p id="totalUsers">...</p></div>
          <div class="stat-card"><h3>Total Artikel</h3><p id="totalArticles">...</p></div>
          <div class="stat-card"><h3>Total Poin Beredar</h3><p id="totalPoints">...</p></div>
        </div>
      </div>
    </div>
  `;
  get(ref(db, 'users')).then(snap => {
    let count = 0, points = 0;
    if (snap.exists()) {
      snap.forEach(u => { count++; points += u.val().points || 0; });
    }
    document.getElementById('totalUsers').textContent = count;
    document.getElementById('totalPoints').textContent = points;
  });
  get(ref(db, 'articles')).then(snap => {
    document.getElementById('totalArticles').textContent = snap.exists() ? Object.keys(snap.val()).length : 0;
  });
}

function renderAdminArticles() {
  appContainer.innerHTML = `
    <div class="dashboard-layout">
      ${renderAdminSidebar('articles')}
      <div class="main-panel">
        <div class="card">
          <h3>Kelola Artikel</h3>
          <button class="btn btn-sm" id="addArticleBtn"><i class="fas fa-plus"></i> Tambah Artikel</button>
          <div id="articleListAdmin" style="margin-top:20px;">Memuat...</div>
        </div>
      </div>
    </div>
    <div id="articleFormModal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); align-items:center; justify-content:center; z-index:100;">
      <div class="card" style="max-width:600px; max-height:90vh; overflow:auto;">
        <h4 id="modalTitle">Tambah Artikel</h4>
        <form id="articleForm">
          <input type="hidden" id="articleId">
          <div class="form-group"><label>Judul</label><input type="text" id="artTitle" required></div>
          <div class="form-group"><label>Kategori</label><input type="text" id="artCategory" value="Umum"></div>
          <div class="form-group"><label>Ringkasan</label><textarea id="artSummary" rows="2"></textarea></div>
          <div class="form-group"><label>Thumbnail URL</label><input type="text" id="artThumb" value="https://picsum.photos/400/200"></div>
          <div class="form-group"><label>Konten (HTML)</label><textarea id="artContent" rows="5"></textarea></div>
          <div class="form-group"><label>Penulis</label><input type="text" id="artAuthor" value="Admin"></div>
          <div class="form-group"><label>Tanggal</label><input type="text" id="artDate" value="${new Date().toLocaleDateString('id-ID')}"></div>
          <button type="submit" class="btn">Simpan</button>
          <button type="button" class="btn btn-outline" id="cancelModalBtn">Batal</button>
        </form>
      </div>
    </div>
  `;
  const modal = document.getElementById('articleFormModal');
  const cancelBtn = document.getElementById('cancelModalBtn');
  const addBtn = document.getElementById('addArticleBtn');
  const form = document.getElementById('articleForm');
  
  function loadArticles() {
    const listDiv = document.getElementById('articleListAdmin');
    onValue(ref(db, 'articles'), (snap) => {
      let html = '<table class="table"><tr><th>Judul</th><th>Kategori</th><th>Aksi</th></tr>';
      if (snap.exists()) {
        Object.entries(snap.val()).forEach(([id, art]) => {
          html += `<tr><td>${art.title}</td><td>${art.category || '-'}</td>
            <td>
              <button class="btn btn-sm btn-outline editArtBtn" data-id="${id}"><i class="fas fa-edit"></i></button>
              <button class="btn btn-sm btn-danger deleteArtBtn" data-id="${id}"><i class="fas fa-trash"></i></button>
            </td></tr>`;
        });
      }
      html += '</table>';
      listDiv.innerHTML = html;
      document.querySelectorAll('.editArtBtn').forEach(btn => btn.addEventListener('click', () => editArticle(btn.dataset.id)));
      document.querySelectorAll('.deleteArtBtn').forEach(btn => btn.addEventListener('click', () => deleteArticle(btn.dataset.id)));
    });
  }
  loadArticles();
  
  async function editArticle(id) {
    const snap = await get(ref(db, `articles/${id}`));
    if (!snap.exists()) return;
    const art = snap.val();
    document.getElementById('articleId').value = id;
    document.getElementById('artTitle').value = art.title || '';
    document.getElementById('artCategory').value = art.category || '';
    document.getElementById('artSummary').value = art.summary || '';
    document.getElementById('artThumb').value = art.thumbnail || '';
    document.getElementById('artContent').value = art.content || '';
    document.getElementById('artAuthor').value = art.author || '';
    document.getElementById('artDate').value = art.date || '';
    document.getElementById('modalTitle').textContent = 'Edit Artikel';
    modal.style.display = 'flex';
  }
  
  async function deleteArticle(id) {
    if (confirm('Yakin hapus artikel?')) {
      await remove(ref(db, `articles/${id}`));
      showToast('Artikel dihapus');
    }
  }
  
  addBtn.addEventListener('click', () => {
    document.getElementById('articleId').value = '';
    form.reset();
    document.getElementById('modalTitle').textContent = 'Tambah Artikel';
    modal.style.display = 'flex';
  });
  
  cancelBtn.addEventListener('click', () => modal.style.display = 'none');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('articleId').value;
    const data = {
      title: document.getElementById('artTitle').value,
      category: document.getElementById('artCategory').value,
      summary: document.getElementById('artSummary').value,
      thumbnail: document.getElementById('artThumb').value,
      content: document.getElementById('artContent').value,
      author: document.getElementById('artAuthor').value,
      date: document.getElementById('artDate').value,
      createdAt: serverTimestamp()
    };
    if (id) {
      await update(ref(db, `articles/${id}`), data);
    } else {
      await push(ref(db, 'articles'), data);
    }
    modal.style.display = 'none';
    showToast('Artikel disimpan');
  });
}

function renderAdminUsers() {
  appContainer.innerHTML = `
    <div class="dashboard-layout">
      ${renderAdminSidebar('users')}
      <div class="main-panel">
        <div class="card">
          <h3>Kelola Pengguna</h3>
          <div id="userListAdmin">Memuat...</div>
        </div>
      </div>
    </div>
  `;
  onValue(ref(db, 'users'), (snap) => {
    const listDiv = document.getElementById('userListAdmin');
    if (snap.exists()) {
      let html = '<table class="table"><tr><th>Username</th><th>Email</th><th>Poin</th><th>Role</th><th>Aksi</th></tr>';
      snap.forEach(child => {
        const u = child.val();
        const uid = child.key;
        html += `<tr><td>${u.username || '-'}</td><td>${u.email}</td><td>${u.points || 0}</td><td>${u.role || 'user'}</td>
          <td>
            <button class="btn btn-sm btn-outline resetPointsBtn" data-uid="${uid}"><i class="fas fa-undo"></i> Reset Poin</button>
            ${userRole === 'superadmin' ? `<button class="btn btn-sm btn-danger deleteUserBtn" data-uid="${uid}"><i class="fas fa-trash"></i></button>` : ''}
          </td></tr>`;
      });
      html += '</table>';
      listDiv.innerHTML = html;
      document.querySelectorAll('.resetPointsBtn').forEach(btn => btn.addEventListener('click', async () => {
        await update(ref(db, `users/${btn.dataset.uid}`), { points: 0 });
        showToast('Poin direset');
      }));
      document.querySelectorAll('.deleteUserBtn').forEach(btn => btn.addEventListener('click', async () => {
        if (confirm('Hapus user? Data tidak bisa dikembalikan.')) {
          await remove(ref(db, `users/${btn.dataset.uid}`));
          showToast('User dihapus');
        }
      }));
    } else {
      listDiv.innerHTML = '<p>Tidak ada pengguna.</p>';
    }
  });
}

function renderAdminAdmins() {
  if (userRole !== 'superadmin') {
    showToast('Akses ditolak', true);
    router();
    return;
  }
  appContainer.innerHTML = `
    <div class="dashboard-layout">
      ${renderAdminSidebar('admins')}
      <div class="main-panel">
        <div class="card">
          <h3><i class="fas fa-user-shield"></i> Kelola Admin</h3>
          <div style="background:#f8fafc; padding:20px; border-radius:16px; margin-bottom:24px;">
            <h4>Tambah Admin Baru</h4>
            <div style="display:flex; gap:12px;">
              <input type="email" id="newAdminEmail" placeholder="Email" style="flex:2;">
              <input type="password" id="newAdminPass" placeholder="Password" style="flex:2;">
              <select id="newAdminRole" style="flex:1;">
                <option value="admin">Admin</option>
                <option value="superadmin">Super Admin</option>
              </select>
              <button class="btn" id="createAdminBtn"><i class="fas fa-plus"></i> Buat</button>
            </div>
          </div>
          <div id="adminList">Memuat...</div>
        </div>
      </div>
    </div>
  `;
  const adminQuery = query(ref(db, 'users'), orderByChild('role'));
  onValue(adminQuery, (snap) => {
    const listDiv = document.getElementById('adminList');
    if (snap.exists()) {
      let html = '<table class="table"><tr><th>Email</th><th>Username</th><th>Role</th><th>Aksi</th></tr>';
      snap.forEach(child => {
        const u = child.val();
        const uid = child.key;
        if (u.role === 'admin' || u.role === 'superadmin') {
          html += `<tr>
            <td>${u.email}</td>
            <td>${u.username || '-'}</td>
            <td><span class="badge ${u.role === 'superadmin' ? 'badge-warning' : ''}">${u.role}</span></td>
            <td>
              ${userRole === 'superadmin' && u.role !== 'superadmin' ? 
                `<button class="btn btn-sm btn-outline changeRoleBtn" data-uid="${uid}" data-role="superadmin">Jadikan Super Admin</button>` : ''}
              ${userRole === 'superadmin' ? 
                `<button class="btn btn-sm btn-danger deleteAdminBtn" data-uid="${uid}">Hapus</button>` : ''}
            </td>
          </tr>`;
        }
      });
      html += '</table>';
      listDiv.innerHTML = html;
    } else {
      listDiv.innerHTML = '<p>Tidak ada admin.</p>';
    }
  });
  document.getElementById('createAdminBtn').addEventListener('click', async () => {
    const email = document.getElementById('newAdminEmail').value.trim();
    const password = document.getElementById('newAdminPass').value.trim();
    const role = document.getElementById('newAdminRole').value;
    if (!email || !password) { showToast('Email dan password wajib', true); return; }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await set(ref(db, `users/${cred.user.uid}`), {
        email,
        username: email.split('@')[0],
        points: 0,
        role: role,
        referralCode: generateReferralCode(),
        referralClicks: 0,
        referralRewardGiven: false,
        createdAt: serverTimestamp()
      });
      showToast(`Admin ${role} berhasil dibuat`);
      document.getElementById('newAdminEmail').value = '';
      document.getElementById('newAdminPass').value = '';
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

function renderAdminSettings() {
  appContainer.innerHTML = `
    <div class="dashboard-layout">
      ${renderAdminSidebar('settings')}
      <div class="main-panel">
        <div class="card">
          <h3>Pengaturan Sistem</h3>
          <form id="settingsForm">
            <div class="form-group"><label>Poin per tonton video</label><input type="number" id="rewardPerView" value="${globalSettings.rewardPerView}"></div>
            <div class="form-group"><label>Threshold referral (klik)</label><input type="number" id="referralThreshold" value="${globalSettings.referralThreshold}"></div>
            <div class="form-group"><label>Nilai tukar (Rp per poin)</label><input type="number" id="exchangeRate" value="${globalSettings.exchangeRate}"></div>
            <button type="submit" class="btn">Simpan Pengaturan</button>
          </form>
        </div>
      </div>
    </div>
  `;
  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newSettings = {
      rewardPerView: parseInt(document.getElementById('rewardPerView').value),
      referralThreshold: parseInt(document.getElementById('referralThreshold').value),
      exchangeRate: parseInt(document.getElementById('exchangeRate').value)
    };
    await set(ref(db, 'settings'), newSettings);
    globalSettings = newSettings;
    showToast('Pengaturan disimpan');
  });
}

// Inisialisasi router pertama kali
router();
