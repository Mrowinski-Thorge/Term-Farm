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
