// ============================================
// TERMINAL FARM - GAME LOGIC
// ============================================

// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GithubAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDPiVhUPuJXhRRjbrftX67IBi2S7B_E3ps",
    authDomain: "term-farm.firebaseapp.com",
    projectId: "term-farm",
    storageBucket: "term-farm.firebasestorage.app",
    messagingSenderId: "319818614073",
    appId: "1:319818614073:web:5f348158b015c3378054e8",
    measurementId: "G-19VJCT6SPG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GithubAuthProvider();

// ============================================
// ACCESS CONTROL
// ============================================

function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true ||
           document.referrer.includes('android-app://');
}

function checkScreenSize() {
    return window.innerWidth >= 768 && window.innerHeight >= 600;
}

function updateAccessControl() {
    const screenOK = checkScreenSize();
    const pwaOK = isPWA();

    document.getElementById('screenWarning').classList.toggle('active', !screenOK);
    document.getElementById('pwaRequired').classList.toggle('active', screenOK && !pwaOK);
    document.getElementById('gameContainer').style.display = (screenOK && pwaOK) ? 'flex' : 'none';

    return screenOK && pwaOK;
}

// ============================================
// GAME STATE
// ============================================

let game = {
    money: 50,
    wheat: 0,
    apples: 0,
    flour: 0,
    wheatFields: 3,
    appleTrees: 2,
    mills: 1,
    wheatGrowing: [],
    applesGrowing: [],
    flourProducing: [],
    tutorialCompleted: false,
    lastUpdate: Date.now(),
    prices: {
        wheat: 8,
        apple: 15,
        flour: 25,
        wheatField: 100,
        appleTree: 200,
        mill: 400
    },
    growthTimes: {
        wheat: 30000,
        apple: 60000,
        flour: 120000
    }
};

let currentUser = null;
let isOnline = navigator.onLine;
let lastCloudBackup = 0;

// DOM Elements
const terminal = document.getElementById('terminal');
const input = document.getElementById('input');
const moneyDisplay = document.getElementById('money-display');
const syncBadge = document.getElementById('syncBadge');

// ============================================
// PRINT & DISPLAY
// ============================================

function print(text, className = '') {
    const line = document.createElement('div');
    line.className = 'output-line ' + className;
    line.textContent = text;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

function updateDisplay() {
    moneyDisplay.textContent = `💰 ${game.money} €`;
    updateSyncBadge();
}

function updateSyncBadge() {
    if (!isOnline) {
        syncBadge.className = 'sync-badge offline';
        syncBadge.textContent = '● Offline';
    } else {
        syncBadge.className = 'sync-badge online';
        syncBadge.textContent = '● Online';
    }
}
// ============================================
// LOCAL STORAGE
// ============================================

function saveLocal() {
    try {
        game.lastUpdate = Date.now();
        const data = {
            ...game,
            wheatGrowing: game.wheatGrowing.map(item => ({
                elapsed: Date.now() - item.startTime
            })),
            applesGrowing: game.applesGrowing.map(item => ({
                elapsed: Date.now() - item.startTime
            })),
            flourProducing: game.flourProducing.map(item => ({
                elapsed: Date.now() - item.startTime
            })),
            version: '3.0'
        };
        localStorage.setItem('terminalFarmSave', JSON.stringify(data));
    } catch (error) {
        console.error('Local save failed:', error);
    }
}

function loadLocal() {
    try {
        const saved = localStorage.getItem('terminalFarmSave');
        if (saved) {
            const data = JSON.parse(saved);
            Object.assign(game, data);
            game.wheatGrowing = (game.wheatGrowing || []).map(item => ({
                startTime: Date.now() - (item.elapsed || 0)
            }));
            game.applesGrowing = (game.applesGrowing || []).map(item => ({
                startTime: Date.now() - (item.elapsed || 0)
            }));
            game.flourProducing = (game.flourProducing || []).map(item => ({
                startTime: Date.now() - (item.elapsed || 0)
            }));
        }
    } catch (error) {
        console.error('Local load failed:', error);
    }
}

// ============================================
// CLOUD BACKUP/RESTORE
// ============================================

async function backupToCloud() {
    if (!currentUser || !isOnline) {
        print('❌ Nicht eingeloggt oder offline!', 'error');
        return false;
    }
    
    try {
        print('☁️ Sichere in Cloud...', 'info');
        
        game.lastUpdate = Date.now();
        const data = {
            ...game,
            wheatGrowing: game.wheatGrowing.map(item => ({
                elapsed: Date.now() - item.startTime
            })),
            applesGrowing: game.applesGrowing.map(item => ({
                elapsed: Date.now() - item.startTime
            })),
            flourProducing: game.flourProducing.map(item => ({
                elapsed: Date.now() - item.startTime
            })),
            backedUpAt: Date.now(),
            version: '3.0'
        };
        
        await setDoc(doc(db, "farms", currentUser.uid), data);
        lastCloudBackup = Date.now();
        print('✓ Cloud-Sicherung erfolgreich!', 'success');
        return true;
    } catch (error) {
        console.error('Cloud backup failed:', error);
        print('❌ Cloud-Sicherung fehlgeschlagen!', 'error');
        return false;
    }
}

async function restoreFromCloud() {
    if (!currentUser || !isOnline) {
        print('❌ Nicht eingeloggt oder offline!', 'error');
        return;
    }
    
    try {
        print('☁️ Lade Cloud-Sicherung...', 'info');
        
        const docRef = doc(db, "farms", currentUser.uid);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
            print('❌ Keine Cloud-Sicherung gefunden!', 'error');
            return;
        }
        
        const cloudData = docSnap.data();
        const localData = JSON.parse(localStorage.getItem('terminalFarmSave') || '{}');
        
        showRestoreComparison(localData, cloudData);
    } catch (error) {
        console.error('Cloud restore failed:', error);
        print('❌ Wiederherstellung fehlgeschlagen!', 'error');
    }
}

function calculateProgress(data) {
    return (data.money || 0) + 
           (data.wheat || 0) * 8 + 
           (data.apples || 0) * 15 + 
           (data.flour || 0) * 25 +
           (data.wheatFields || 0) * 100 +
           (data.appleTrees || 0) * 200 +
           (data.mills || 0) * 400;
}

function showRestoreComparison(localData, cloudData) {
    const modal = document.getElementById('cloudRestoreModal');
    const content = document.getElementById('cloudRestoreContent');
    
    const localDate = new Date(localData.lastUpdate || 0);
    const cloudDate = new Date(cloudData.lastUpdate || 0);
    
    const localScore = calculateProgress(localData);
    const cloudScore = calculateProgress(cloudData);
    const localRecommended = localScore >= cloudScore;
    
    content.innerHTML = `
        <div style="text-align: center; margin-bottom: 25px;">
            <div style="color: #00aaff; font-size: 14px;">
                Möchtest du die Cloud-Sicherung wiederherstellen?
            </div>
        </div>
        
        <div class="save-comparison">
            <div class="save-card ${localRecommended ? 'recommended' : ''}">
                ${localRecommended ? '<div class="save-card-badge">⭐ AKTUELL</div>' : ''}
                <div class="save-card-title">💾 AKTUELLER STAND</div>
                <div class="save-stat"><strong>📅 Datum:</strong> ${localDate.toLocaleString('de-DE')}</div>
                <div class="save-stat"><strong>💰 Geld:</strong> ${localData.money} €</div>
                <div class="save-stat"><strong>🌾 Weizen:</strong> ${localData.wheat}</div>
                <div class="save-stat"><strong>🍎 Äpfel:</strong> ${localData.apples}</div>
                <div class="save-stat"><strong>🏺 Mehl:</strong> ${localData.flour}</div>
                <div class="save-stat"><strong>🏗️ Felder:</strong> ${localData.wheatFields || 0}</div>
                <div class="save-stat"><strong>🌳 Bäume:</strong> ${localData.appleTrees || 0}</div>
                <div class="save-stat"><strong>⚙️ Mühlen:</strong> ${localData.mills || 0}</div>
                <div class="save-stat" style="background: #002200; color: #00ff00; margin-top: 10px;">
                    <strong>📊 Fortschritt:</strong> ${localScore} Punkte
                </div>
            </div>
            
            <div class="save-card ${!localRecommended ? 'recommended' : ''}">
                ${!localRecommended ? '<div class="save-card-badge">⭐ EMPFOHLEN</div>' : ''}
                <div class="save-card-title">☁️ CLOUD-SICHERUNG</div>
                <div class="save-stat"><strong>📅 Datum:</strong> ${cloudDate.toLocaleString('de-DE')}</div>
                <div class="save-stat"><strong>💰 Geld:</strong> ${cloudData.money} €</div>
                <div class="save-stat"><strong>🌾 Weizen:</strong> ${cloudData.wheat}</div>
                <div class="save-stat"><strong>🍎 Äpfel:</strong> ${cloudData.apples}</div>
                <div class="save-stat"><strong>🏺 Mehl:</strong> ${cloudData.flour}</div>
                <div class="save-stat"><strong>🏗️ Felder:</strong> ${cloudData.wheatFields || 0}</div>
                <div class="save-stat"><strong>🌳 Bäume:</strong> ${cloudData.appleTrees || 0}</div>
                <div class="save-stat"><strong>⚙️ Mühlen:</strong> ${cloudData.mills || 0}</div>
                <div class="save-stat" style="background: #002200; color: #00ff00; margin-top: 10px;">
                    <strong>📊 Fortschritt:</strong> ${cloudScore} Punkte
                </div>
            </div>
        </div>
        
        <div class="choice-buttons">
            <button class="btn" id="keepCurrentBtn" style="font-size: 16px; padding: 15px;">
                💾 Aktuell behalten
            </button>
            <button class="btn" id="restoreCloudBtn" style="font-size: 16px; padding: 15px;">
                ☁️ Cloud wiederherstellen
            </button>
        </div>
    `;
    
    document.getElementById('keepCurrentBtn').addEventListener('click', () => {
        modal.classList.remove('active');
        print('✓ Aktueller Spielstand beibehalten', 'success');
        print('');
    });
    
    document.getElementById('restoreCloudBtn').addEventListener('click', () => {
        modal.classList.remove('active');
        Object.assign(game, cloudData);
        game.wheatGrowing = (game.wheatGrowing || []).map(item => ({
            startTime: Date.now() - (item.elapsed || 0)
        }));
        game.applesGrowing = (game.applesGrowing || []).map(item => ({
            startTime: Date.now() - (item.elapsed || 0)
        }));
        game.flourProducing = (game.flourProducing || []).map(item => ({
            startTime: Date.now() - (item.elapsed || 0)
        }));
        saveLocal();
        updateDisplay();
        print('✓ Cloud-Sicherung wiederhergestellt!', 'success');
        print('');
    });
    
    modal.classList.add('active');
}

// ============================================
// AUTHENTICATION
// ============================================

async function githubLogin() {
    try {
        const result = await signInWithPopup(auth, provider);
        currentUser = result.user;
        print(`✓ Eingeloggt als: ${currentUser.displayName || 'GitHub User'}`, 'success');
        print('Du kannst jetzt Cloud-Sicherungen erstellen!', 'info');
        print('');
        
        if (isOnline) {
            try {
                const docRef = doc(db, "farms", currentUser.uid);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    const cloudData = docSnap.data();
                    lastCloudBackup = cloudData.backedUpAt || cloudData.lastUpdate || 0;
                    print('☁️ Cloud-Sicherung gefunden!', 'info');
                    print('Tippe "restore" um sie wiederherzustellen.', 'warning');
                    print('');
                }
            } catch (error) {
                console.error('Could not load cloud status:', error);
            }
        }
    } catch (error) {
        console.error('Login failed:', error);
        print('❌ Login fehlgeschlagen', 'error');
    }
}

async function logout() {
    try {
        await signOut(auth);
        currentUser = null;
        lastCloudBackup = 0;
        print('✓ Ausgeloggt', 'success');
        print('');
    } catch (error) {
        console.error('Logout failed:', error);
    }
}

// ============================================
// MODALS
// ============================================

function openStatus() {
    const modal = document.getElementById('statusModal');
    const content = document.getElementById('statusContent');
    
    let html = '';
    
    if (game.wheatGrowing.length > 0) {
        html += '<div class="status-item"><div class="status-item-title">🌾 WEIZEN WÄCHST:</div>';
        game.wheatGrowing.forEach((item, i) => {
            const elapsed = Date.now() - item.startTime;
            const remaining = Math.max(0, Math.ceil((game.growthTimes.wheat - elapsed) / 1000));
            const status = remaining > 0 ? `noch ${remaining}s` : '✓ FERTIG!';
            const className = remaining > 0 ? 'growing' : 'ready';
            html += `<div class="status-item-content ${className}">[${i+1}] ${status}</div>`;
        });
        html += '</div>';
    }
    
    if (game.applesGrowing.length > 0) {
        html += '<div class="status-item"><div class="status-item-title">🍎 ÄPFEL WACHSEN:</div>';
        game.applesGrowing.forEach((item, i) => {
            const elapsed = Date.now() - item.startTime;
            const remaining = Math.max(0, Math.ceil((game.growthTimes.apple - elapsed) / 1000));
            const status = remaining > 0 ? `noch ${remaining}s` : '✓ FERTIG!';
            const className = remaining > 0 ? 'growing' : 'ready';
            html += `<div class="status-item-content ${className}">[${i+1}] ${status}</div>`;
        });
        html += '</div>';
    }
    
    if (game.flourProducing.length > 0) {
        html += '<div class="status-item"><div class="status-item-title">🏺 MEHL PRODUKTION:</div>';
        game.flourProducing.forEach((item, i) => {
            const elapsed = Date.now() - item.startTime;
            const remaining = Math.max(0, Math.ceil((game.growthTimes.flour - elapsed) / 1000));
            const status = remaining > 0 ? `noch ${remaining}s` : '✓ FERTIG!';
            const className = remaining > 0 ? 'growing' : 'ready';
            html += `<div class="status-item-content ${className}">[${i+1}] ${status}</div>`;
        });
        html += '</div>';
    }
    
    if (game.wheatGrowing.length === 0 && game.applesGrowing.length === 0 && game.flourProducing.length === 0) {
        html += '<div class="status-item"><div class="status-item-title">🌱 PRODUKTION:</div>';
        html += '<div class="status-item-content" style="color: #ffaa00;">Nichts wächst gerade</div></div>';
    }
    
    html += '<div class="status-item"><div class="status-item-title">🏗️ GEBÄUDE:</div>';
    html += `<div class="status-item-content">🌾 Weizenfelder: ${game.wheatFields}</div>`;
    html += `<div class="status-item-content">🍎 Apfelbäume: ${game.appleTrees}</div>`;
    html += `<div class="status-item-content">⚙️ Mühlen: ${game.mills}</div>`;
    html += '</div>';
    
    content.innerHTML = html;
    modal.classList.add('active');
}

function closeStatus() {
    document.getElementById('statusModal').classList.remove('active');
}

function openInventory() {
    const modal = document.getElementById('inventoryModal');
    const content = document.getElementById('inventoryContent');
    
    content.innerHTML = `
        <div class="modal-item">
            <strong>🌾 Weizen:</strong> ${game.wheat}
        </div>
        <div class="modal-item">
            <strong>🍎 Äpfel:</strong> ${game.apples}
        </div>
        <div class="modal-item">
            <strong>🏺 Mehl:</strong> ${game.flour}
        </div>
    `;
    
    modal.classList.add('active');
}

function closeInventory() {
    document.getElementById('inventoryModal').classList.remove('active');
}

async function openSettings() {
    const modal = document.getElementById('settingsModal');
    const content = document.getElementById('settingsContent');
    
    if (currentUser) {
        let cloudStatusText = 'Wird geladen...';
        let cloudStatusColor = '#ffaa00';
        
        if (!isOnline) {
            cloudStatusText = 'Keine Verbindung';
            cloudStatusColor = '#ff0000';
        } else {
            try {
                const docRef = doc(db, "farms", currentUser.uid);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    const cloudData = docSnap.data();
                    lastCloudBackup = cloudData.backedUpAt || cloudData.lastUpdate || 0;
                    const backupDate = new Date(lastCloudBackup);
                    cloudStatusText = backupDate.toLocaleString('de-DE');
                    cloudStatusColor = '#00ff00';
                } else {
                    cloudStatusText = 'Noch keine Sicherung';
                    cloudStatusColor = '#ffaa00';
                }
            } catch (error) {
                console.error('Cloud status check failed:', error);
                cloudStatusText = 'Fehler beim Laden';
                cloudStatusColor = '#ff0000';
            }
        }
        
        const username = currentUser.displayName || 
                       currentUser.reloadUserInfo?.screenName || 
                       currentUser.email?.split('@')[0] ||
                       'GitHub User';
        
        content.innerHTML = `
            <div class="modal-item">
                <strong>👤 Angemeldet als:</strong> ${username}
            </div>
            <div class="modal-item">
                <strong>🕐 Letzte Cloud-Sicherung:</strong><br>
                <span style="color: ${cloudStatusColor};">${cloudStatusText}</span>
            </div>
            <div class="modal-item" style="background: #001100; border-color: #00aaff;">
                <strong>💾 Speicherung:</strong> Lokal (alle 2s automatisch)
            </div>
            <div class="modal-buttons">
                <button class="btn" id="backupBtn" style="border-color: #00aaff; color: #00aaff;">☁️ Sichern</button>
                <button class="btn" id="restoreBtn">↓ Wiederherstellen</button>
                <button class="btn" id="logoutBtn" style="border-color: #ff0000; color: #ff0000;">Ausloggen</button>
            </div>
            <div class="modal-buttons" style="justify-content: center; margin-top: 10px;">
                <button class="btn" id="closeSettingsBtn2" style="width: 100%;">Schließen</button>
            </div>
        `;
        
        document.getElementById('logoutBtn').addEventListener('click', () => {
            closeSettings();
            logout();
        });
        
        document.getElementById('backupBtn').addEventListener('click', async () => {
            closeSettings();
            await backupToCloud();
        });
        
        document.getElementById('restoreBtn').addEventListener('click', async () => {
            closeSettings();
            await restoreFromCloud();
        });
        
        document.getElementById('closeSettingsBtn2').addEventListener('click', closeSettings);
    } else {
        content.innerHTML = `
            <div class="modal-item">
                <strong>👤 Status:</strong> <span style="color: #ffaa00;">Nicht angemeldet</span>
            </div>
            <div class="modal-item">
                <strong>💾 Speicherung:</strong> <span style="color: #00ff00;">Lokal (alle 2s automatisch)</span>
            </div>
            <div class="modal-item" style="padding: 20px; background: #001100; border-color: #00aaff;">
                <strong style="color: #00aaff;">☁️ Cloud-Sicherung (Optional)</strong>
                <p style="margin-top: 10px; color: #00aaff; font-size: 14px;">
                    Melde dich mit GitHub an, um deine Daten zusätzlich in der Cloud zu sichern!
                </p>
                <p style="margin-top: 10px; color: #00ff00; font-size: 13px;">
                    ✓ Zusätzliches Backup<br>
                    ✓ Manuell wiederherstellbar<br>
                    ✓ Völlig optional
                </p>
            </div>
            <div class="modal-buttons">
                <button class="btn" id="loginBtn">🔗 Mit GitHub anmelden</button>
            </div>
            <div class="modal-buttons" style="justify-content: center; margin-top: 10px;">
                <button class="btn" id="closeSettingsBtn3" style="width: 100%;">Schließen</button>
            </div>
        `;
        
        document.getElementById('loginBtn').addEventListener('click', () => {
            closeSettings();
            githubLogin();
        });
        
        document.getElementById('closeSettingsBtn3').addEventListener('click', closeSettings);
    }
    
    modal.classList.add('active');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function startTutorial() {
    const modal = document.getElementById('tutorialModal');
    const content = document.getElementById('tutorialContent');
    
    content.innerHTML = `
        <div class="tutorial-step">
            <h3>Schritt 1: Felder bepflanzen 🌾</h3>
            <p>Tippe: <strong style="color: #ffaa00;">plant wheat 3</strong></p>
            <p>Dies pflanzt Weizen auf 3 deiner Felder. Weizen wächst 30 Sekunden.</p>
        </div>
        
        <div class="tutorial-step">
            <h3>Schritt 2: Ernten 📦</h3>
            <p>Warte 30 Sekunden und tippe: <strong style="color: #ffaa00;">harvest all</strong></p>
            <p>Dies erntet alle fertigen Pflanzen.</p>
        </div>
        
        <div class="tutorial-step">
            <h3>Schritt 3: Verkaufen 💰</h3>
            <p>Tippe: <strong style="color: #ffaa00;">sell all</strong></p>
            <p>Dies verkauft alles und bringt dir Geld!</p>
        </div>
        
        <div class="tutorial-step">
            <h3>Schritt 4: Erweitern 🏗️</h3>
            <p>Tippe: <strong style="color: #ffaa00;">buy field</strong></p>
            <p>Kaufe mehr Felder, Bäume und Mühlen!</p>
        </div>
        
        <div class="tutorial-step">
            <h3>Weitere Befehle 📋</h3>
            <p>Tippe: <strong style="color: #ffaa00;">help</strong></p>
            <p>Für alle Befehle.</p>
        </div>
        
        <div class="modal-buttons">
            <button class="btn" id="closeTutorialBtn" style="font-size: 18px; padding: 15px;">
                Los geht's! 🚀
            </button>
        </div>
    `;
    
    document.getElementById('closeTutorialBtn').addEventListener('click', () => {
        document.getElementById('tutorialModal').classList.remove('active');
        game.tutorialCompleted = true;
        saveLocal();
        print('✓ Tutorial abgeschlossen! Viel Erfolg! 🎉', 'success');
        print('');
    });
    
    modal.classList.add('active');
}
// ============================================
// COMMANDS
// ============================================

const commands = {
    help: () => {
        print('╔══════════════════════════════════════════════════╗', 'info');
        print('║              VERFÜGBARE BEFEHLE                  ║', 'info');
        print('╚══════════════════════════════════════════════════╝', 'info');
        print('');
        print('🌱 ANBAUEN: plant wheat/apple [anzahl]', 'success');
        print('🏺 PRODUZIEREN: produce flour [anzahl]', 'success');
        print('📦 ERNTEN: harvest wheat/apple/flour/all [anzahl]', 'success');
        print('💰 VERKAUFEN: sell wheat/apple/flour/all [anzahl]', 'success');
        print('🏗️ KAUFEN: buy field/tree/mill [anzahl]', 'success');
        print('📊 INFO: prices, clear', 'success');
        print('☁️ CLOUD: login, backup, restore', 'success');
        print('');
    },

    login: () => {
        githubLogin();
    },

    backup: async () => {
        await backupToCloud();
    },

    restore: async () => {
        await restoreFromCloud();
    },

    prices: () => {
        print('╔══════════════════════════════════════════════════╗', 'info');
        print('║              MARKTPREISE                         ║', 'info');
        print('╚══════════════════════════════════════════════════╝', 'info');
        print('');
        print('💰 VERKAUF:', 'success');
        print(`  🌾 Weizen: ${game.prices.wheat} €`);
        print(`  🍎 Apfel: ${game.prices.apple} €`);
        print(`  🏺 Mehl: ${game.prices.flour} €`);
        print('');
        print('🏗️ KAUF:', 'warning');
        print(`  🌾 Feld: ${game.prices.wheatField} €`);
        print(`  🍎 Baum: ${game.prices.appleTree} €`);
        print(`  ⚙️ Mühle: ${game.prices.mill} €`);
        print('');
    },

    plant: (args) => {
        const type = args[0];
        let amount = 1;
        if (args.length > 1) {
            const parsed = parseInt(args[1]);
            if (isNaN(parsed) || parsed < 1) {
                print('❌ Ungültige Anzahl!', 'error');
                return;
            }
            amount = parsed;
        }

        if (type === 'wheat') {
            const available = game.wheatFields - game.wheatGrowing.length;
            if (amount > available) {
                print(`❌ Nur ${available} Felder verfügbar!`, 'error');
                return;
            }
            for (let i = 0; i < amount; i++) {
                game.wheatGrowing.push({ startTime: Date.now() });
            }
            print(`✓ ${amount}x Weizen angepflanzt! (30s)`, 'success');
        } else if (type === 'apple') {
            const available = game.appleTrees - game.applesGrowing.length;
            if (amount > available) {
                print(`❌ Nur ${available} Bäume verfügbar!`, 'error');
                return;
            }
            for (let i = 0; i < amount; i++) {
                game.applesGrowing.push({ startTime: Date.now() });
            }
            print(`✓ ${amount}x Äpfel angepflanzt! (60s)`, 'success');
        } else {
            print('❌ Nutze: wheat oder apple', 'error');
            return;
        }
        saveLocal();
        updateDisplay();
    },

    produce: (args) => {
        const type = args[0];
        let amount = 1;
        if (args.length > 1) {
            const parsed = parseInt(args[1]);
            if (isNaN(parsed) || parsed < 1) {
                print('❌ Ungültige Anzahl!', 'error');
                return;
            }
            amount = parsed;
        }

        if (type === 'flour') {
            const available = game.mills - game.flourProducing.length;
            if (amount > available) {
                print(`❌ Nur ${available} Mühlen verfügbar!`, 'error');
                return;
            }
            const wheatNeeded = amount * 2;
            if (game.wheat < wheatNeeded) {
                print(`❌ Du brauchst ${wheatNeeded} Weizen!`, 'error');
                return;
            }
            game.wheat -= wheatNeeded;
            for (let i = 0; i < amount; i++) {
                game.flourProducing.push({ startTime: Date.now() });
            }
            print(`✓ ${amount}x Mehl wird produziert! (120s)`, 'success');
        } else {
            print('❌ Nutze: flour', 'error');
            return;
        }
        saveLocal();
        updateDisplay();
    },

    harvest: (args) => {
        const type = args[0];

        if (type === 'all') {
            let totalHarvested = 0;
            
            const readyWheat = game.wheatGrowing.filter(item => 
                Date.now() - item.startTime >= game.growthTimes.wheat
            );
            game.wheat += readyWheat.length;
            game.wheatGrowing = game.wheatGrowing.filter(item => 
                Date.now() - item.startTime < game.growthTimes.wheat
            );
            if (readyWheat.length > 0) {
                print(`✓ ${readyWheat.length}x Weizen geerntet!`, 'success');
                totalHarvested += readyWheat.length;
            }

            const readyApples = game.applesGrowing.filter(item => 
                Date.now() - item.startTime >= game.growthTimes.apple
            );
            game.apples += readyApples.length;
            game.applesGrowing = game.applesGrowing.filter(item => 
                Date.now() - item.startTime < game.growthTimes.apple
            );
            if (readyApples.length > 0) {
                print(`✓ ${readyApples.length}x Äpfel geerntet!`, 'success');
                totalHarvested += readyApples.length;
            }

            const readyFlour = game.flourProducing.filter(item => 
                Date.now() - item.startTime >= game.growthTimes.flour
            );
            game.flour += readyFlour.length;
            game.flourProducing = game.flourProducing.filter(item => 
                Date.now() - item.startTime < game.growthTimes.flour
            );
            if (readyFlour.length > 0) {
                print(`✓ ${readyFlour.length}x Mehl geerntet!`, 'success');
                totalHarvested += readyFlour.length;
            }

            if (totalHarvested === 0) {
                print('❌ Nichts bereit zum Ernten!', 'error');
            }
        } else if (type === 'wheat' || type === 'apple' || type === 'flour') {
            let amount = 999999;
            if (args.length > 1) {
                const parsed = parseInt(args[1]);
                if (isNaN(parsed) || parsed < 1) {
                    print('❌ Ungültige Anzahl!', 'error');
                    return;
                }
                amount = parsed;
            }
            
            if (type === 'wheat') {
                const ready = game.wheatGrowing.filter(item => 
                    Date.now() - item.startTime >= game.growthTimes.wheat
                ).slice(0, amount);
                
                if (ready.length === 0) {
                    print('❌ Kein Weizen bereit!', 'error');
                    return;
                }
                
                game.wheat += ready.length;
                game.wheatGrowing = game.wheatGrowing.filter(item => !ready.includes(item));
                print(`✓ ${ready.length}x Weizen geerntet!`, 'success');
            } else if (type === 'apple') {
                const ready = game.applesGrowing.filter(item => 
                    Date.now() - item.startTime >= game.growthTimes.apple
                ).slice(0, amount);
                
                if (ready.length === 0) {
                    print('❌ Keine Äpfel bereit!', 'error');
                    return;
                }
                
                game.apples += ready.length;
                game.applesGrowing = game.applesGrowing.filter(item => !ready.includes(item));
                print(`✓ ${ready.length}x Äpfel geerntet!`, 'success');
            } else if (type === 'flour') {
                const ready = game.flourProducing.filter(item => 
                    Date.now() - item.startTime >= game.growthTimes.flour
                ).slice(0, amount);
                
                if (ready.length === 0) {
                    print('❌ Kein Mehl bereit!', 'error');
                    return;
                }
                
                game.flour += ready.length;
                game.flourProducing = game.flourProducing.filter(item => !ready.includes(item));
                print(`✓ ${ready.length}x Mehl geerntet!`, 'success');
            }
        } else {
            print('❌ Nutze: wheat, apple, flour oder all', 'error');
            return;
        }
        saveLocal();
        updateDisplay();
    },

    sell: (args) => {
        const type = args[0];

        if (type === 'all') {
            const total = (game.wheat * game.prices.wheat) + 
                        (game.apples * game.prices.apple) + 
                        (game.flour * game.prices.flour);
            if (total === 0) {
                print('❌ Nichts zum Verkaufen!', 'error');
                return;
            }
            print(`✓ Verkauft: ${game.wheat} Weizen, ${game.apples} Äpfel, ${game.flour} Mehl`, 'success');
            print(`💰 +${total} €!`, 'success');
            game.money += total;
            game.wheat = 0;
            game.apples = 0;
            game.flour = 0;
        } else if (type === 'wheat' || type === 'apple' || type === 'flour') {
            let amount = type === 'wheat' ? game.wheat : (type === 'apple' ? game.apples : game.flour);
            if (args.length > 1) {
                const parsed = parseInt(args[1]);
                if (isNaN(parsed) || parsed < 1) {
                    print('❌ Ungültige Anzahl!', 'error');
                    return;
                }
                amount = parsed;
            }
            
            if (type === 'wheat') {
                if (amount > game.wheat) {
                    print(`❌ Du hast nur ${game.wheat} Weizen!`, 'error');
                    return;
                }
                const earned = amount * game.prices.wheat;
                game.wheat -= amount;
                game.money += earned;
                print(`✓ ${amount}x Weizen verkauft! (+${earned} €)`, 'success');
            } else if (type === 'apple') {
                if (amount > game.apples) {
                    print(`❌ Du hast nur ${game.apples} Äpfel!`, 'error');
                    return;
                }
                const earned = amount * game.prices.apple;
                game.apples -= amount;
                game.money += earned;
                print(`✓ ${amount}x Äpfel verkauft! (+${earned} €)`, 'success');
            } else if (type === 'flour') {
                if (amount > game.flour) {
                    print(`❌ Du hast nur ${game.flour} Mehl!`, 'error');
                    return;
                }
                const earned = amount * game.prices.flour;
                game.flour -= amount;
                game.money += earned;
                print(`✓ ${amount}x Mehl verkauft! (+${earned} €)`, 'success');
            }
        } else {
            print('❌ Nutze: wheat, apple, flour oder all', 'error');
            return;
        }
        saveLocal();
        updateDisplay();
    },

    buy: (args) => {
        const type = args[0];
        let amount = 1;
        if (args.length > 1) {
            const parsed = parseInt(args[1]);
            if (isNaN(parsed) || parsed < 1) {
                print('❌ Ungültige Anzahl!', 'error');
                return;
            }
            amount = parsed;
        }

        if (type === 'field') {
            const cost = game.prices.wheatField * amount;
            if (game.money < cost) {
                print(`❌ Nicht genug Geld! (${cost} € benötigt)`, 'error');
                return;
            }
            game.money -= cost;
            game.wheatFields += amount;
            print(`✓ ${amount}x Feld gekauft! (-${cost} €)`, 'success');
        } else if (type === 'tree') {
            const cost = game.prices.appleTree * amount;
            if (game.money < cost) {
                print(`❌ Nicht genug Geld! (${cost} € benötigt)`, 'error');
                return;
            }
            game.money -= cost;
            game.appleTrees += amount;
            print(`✓ ${amount}x Baum gekauft! (-${cost} €)`, 'success');
        } else if (type === 'mill') {
            const cost = game.prices.mill * amount;
            if (game.money < cost) {
                print(`❌ Nicht genug Geld! (${cost} € benötigt)`, 'error');
                return;
            }
            game.money -= cost;
            game.mills += amount;
            print(`✓ ${amount}x Mühle gekauft! (-${cost} €)`, 'success');
        } else {
            print('❌ Nutze: field, tree oder mill', 'error');
            return;
        }
        saveLocal();
        updateDisplay();
    },

    clear: () => {
        terminal.innerHTML = '';
    }
};

function processCommand(cmd) {
    print(`farm@terminal:~$ ${cmd}`, 'info');
    
    const parts = cmd.trim().toLowerCase().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    if (commands[command]) {
        commands[command](args);
    } else if (cmd.trim() === '') {
        // Do nothing
    } else {
        print(`❌ Befehl nicht gefunden: ${command}`, 'error');
        print('Tippe "help" für alle Befehle.', 'warning');
    }
    print('');
}

// ============================================
// EVENT LISTENERS
// ============================================

document.getElementById('statusBtn').addEventListener('click', openStatus);
document.getElementById('inventoryBtn').addEventListener('click', openInventory);
document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('closeStatusBtn').addEventListener('click', closeStatus);
document.getElementById('closeInventoryBtn').addEventListener('click', closeInventory);

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const cmd = input.value;
        input.value = '';
        processCommand(cmd);
    }
});

// Allow scroll in modals
document.querySelectorAll('.modal-content').forEach(element => {
    element.addEventListener('touchstart', (e) => {
        e.stopPropagation();
    }, { passive: true });
    
    element.addEventListener('touchmove', (e) => {
        e.stopPropagation();
    }, { passive: true });
    
    element.addEventListener('touchend', () => {
        delete element._lastTouchY;
    }, { passive: true });
});

// Prevent double-tap zoom
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// Prevent pinch zoom
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

// Focus management
document.addEventListener('click', (e) => {
    if (!e.target.closest('.modal-content') && 
        !e.target.closest('.blocking-screen') && 
        !e.target.closest('.btn')) {
        input.focus();
    }
});

// ============================================
// CONNECTION & LIFECYCLE
// ============================================

window.addEventListener('online', () => {
    isOnline = true;
    updateSyncBadge();
    print('✓ Verbindung wiederhergestellt', 'success');
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateSyncBadge();
    print('⚠️ Offline-Modus', 'warning');
});

window.addEventListener('beforeunload', () => {
    saveLocal();
});

window.addEventListener('resize', () => {
    updateAccessControl();
});

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    
    if (user && isOnline) {
        try {
            const docRef = doc(db, "farms", user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const cloudData = docSnap.data();
                lastCloudBackup = cloudData.backedUpAt || cloudData.lastUpdate || 0;
            }
        } catch (error) {
            console.error('Could not load cloud backup status:', error);
        }
    }
});

// ============================================
// AUTO-SAVE SYSTEM
// ============================================

setInterval(() => {
    saveLocal();
}, 2000);

setInterval(updateDisplay, 1000);

// ============================================
// WELCOME MESSAGE
// ============================================

function printWelcome() {
    print('═══════════════════════════════════════════════════════', 'info');
    print('   🌾 Willkommen bei TERMINAL FARM! 🌾', 'info');
    print('═══════════════════════════════════════════════════════', 'info');
    print('');
    print('💾 Auto-Save: Lokal alle 2 Sekunden', 'info');
    print('☁️ Cloud-Sicherung: Optional mit GitHub', 'info');
    print('');
    print('Baue Pflanzen an, produziere Waren und verkaufe sie!', 'info');
    print('');
    print('Tippe "help" für alle Befehle!', 'warning');
    print('');
}

// ============================================
// INITIALIZATION
// ============================================

if (updateAccessControl()) {
    loadLocal();
    updateDisplay();
    printWelcome();
    
    if (currentUser && isOnline) {
        (async () => {
            try {
                const docRef = doc(db, "farms", currentUser.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const cloudData = docSnap.data();
                    lastCloudBackup = cloudData.backedUpAt || cloudData.lastUpdate || 0;
                }
            } catch (error) {
                console.error('Could not load cloud backup status:', error);
            }
        })();
    }
    
    if (!game.tutorialCompleted) {
        setTimeout(startTutorial, 1000);
    }
}
