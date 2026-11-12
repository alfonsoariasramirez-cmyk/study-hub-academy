/**
 * Study Hub Academy - Lógica Principal (v2.0)
 * Arquitectura modular cliente-servidor con integración a Google Sheets CMS y Gamificación.
 */
console.log("Inicia carga de app.js");

// URL de publicación CSV del AppConfig oficial (v1.4 - v2.0)
const APP_CONFIG_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRGBmoGizzNKU8G5AAHx0B7X929ljOcclcnx7enTgDLixnaJ3Xn61buqcb8BkRGTt16qIUjQQKFIJch/pub?gid=112265702&single=true&output=csv";

// Estado global de la aplicación
let subjectsCatalog = [];
let currentQuestions = [];    // Preguntas activas de la materia seleccionada
let currentQuestionIndex = 0;
let score = 0;
let activeQuizSubject = "";

/**
 * ============================================================================
 * [EPIC-06] SISTEMA DE GAMIFICACIÓN, RACHAS Y PUNTOS DE EGO (LOCALSTORAGE)
 * ============================================================================
 */
let userStats = {
    streak: 0,
    ep: 0,
    rank: "Novato",
    lastLoginDate: ""
};

function loadUserStats() {
    console.log("Inicia loadUserStats");
    try {
        const saved = localStorage.getItem("study_hub_user_stats");
        if (saved) {
            userStats = JSON.parse(saved);
        }
        checkStreak();
    } catch (e) {
        console.error("Error al leer localStorage, reiniciando estado:", e);
    }
    updateEgoBarUI();
}

function checkStreak() {
    console.log("checkStreak");
    const today = new Date().toISOString().slice(0, 10);
    if (!userStats.lastLoginDate) {
        userStats.streak = 1;
        userStats.lastLoginDate = today;
    } else {
        const lastDate = new Date(userStats.lastLoginDate);
        const currentDate = new Date(today);
        const diffDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            userStats.streak++;
            userStats.lastLoginDate = today;
        } else if (diffDays > 1) {
            userStats.streak = 1;
            userStats.lastLoginDate = today;
        }
    }
    saveUserStats();
}

function saveUserStats() {
    try {
        localStorage.setItem("study_hub_user_stats", JSON.stringify(userStats));
    } catch (e) {
        console.error("Error al guardar en localStorage:", e);
    }
}

function updateEgoRank() {
    if (userStats.ep >= 100) userStats.rank = "Delantero Estrella ⭐";
    else if (userStats.ep >= 50) userStats.rank = "Titular Convictivo ⚽";
    else if (userStats.ep >= 20) userStats.rank = "Juvenil Promesa 🏃‍♂️";
    else userStats.rank = "Novato 🐣";
}

function updateEgoBarUI() {
    updateEgoRank();
    const streakEl = document.getElementById("streak-count");
    const epEl = document.getElementById("ep-score");
    const rankEl = document.getElementById("ego-rank");
    
    if (streakEl) streakEl.innerText = userStats.streak;
    if (epEl) epEl.innerText = userStats.ep;
    if (rankEl) rankEl.innerText = userStats.rank;
}

/**
 * ============================================================================
 * EFECTOS DE AUDIO (Web Audio API - BUG-002)
 * ============================================================================
 */
function playSound(isCorrect) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = isCorrect ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(isCorrect ? 587.33 : 220, ctx.currentTime);
        
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
        console.log("Audio no soportado o bloqueado por el navegador");
    }
}

/**
 * ============================================================================
 * MOTOR DE PARSEO CSV Y GESTIÓN DE VISTAS (CMS)
 * ============================================================================
 */
function parseCSV(text) {
    let lines = [];
    let row = [""];
    let insideQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        let c = text[i];
        let nextC = text[i + 1];
        
        if (c === '"' && insideQuotes && nextC === '"') {
            row[row.length - 1] += '"';
            i++;
        } else if (c === '"') {
            insideQuotes = !insideQuotes;
        } else if (c === ',' && !insideQuotes) {
            row.push("");
        } else if ((c === '\r' || c === '\n') && !insideQuotes) {
            if (c === '\r' && nextC === '\n') { i++; }
            lines.push(row);
            row = [""];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== "") {
        lines.push(row);
    }
    return lines;
}

async function initApp() {
    console.log("Inicia initApp");
    loadUserStats();
    showView('loading-view');
    try {
        const cacheBuster = `&_t=${new Date().getTime()}`;
        const response = await fetch(APP_CONFIG_URL + cacheBuster);
        if (!response.ok) throw new Error("Error HTTP: " + response.status);
        
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        
        subjectsCatalog = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (r.length >= 5 && r[0].trim() === "Subject") {
                subjectsCatalog.push({
                    key: r[1].trim(),
                    name: r[2].trim(),
                    icon: r[3].trim(),
                    url: r[4].trim()
                });
            } else if (r.length >= 3 && r[0].trim() === "Setting" && r[1].trim() === "AppTitle") {
                const titleEl = document.getElementById("app-title");
                if (titleEl) titleEl.innerText = r[2].trim();
            }
        }

        if (subjectsCatalog.length === 0) throw new Error("No hay materias configuradas.");

        renderSubjects();
        showView('subjects-view');
    } catch (err) {
        console.error("Fallo de red o parseo en AppConfig:", err);
        showView('error-view');
    }
}

function showView(viewId) {
    ['loading-view', 'error-view', 'subjects-view', 'quiz-view', 'results-view'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const targetEl = document.getElementById(viewId);
    if (targetEl) targetEl.classList.remove('hidden');
}

function renderSubjects() {
    const grid = document.getElementById("subjects-grid");
    if (!grid) return;
    grid.innerHTML = "";
    subjectsCatalog.forEach(sub => {
        const card = document.createElement("div");
        card.className = "subject-card";
        card.innerHTML = `
            <div class="subject-icon">${sub.icon}</div>
            <div class="subject-name">${sub.name}</div>
        `;
        card.onclick = () => loadSubjectQuiz(sub);
        grid.appendChild(card);
    });
}

/**
 * [BUG-001 Solucionado] Carga directa de preguntas al hacer clic en la materia (flujo v1.7)
 */
async function loadSubjectQuiz(subject) {
    activeQuizSubject = subject.name;
    showView('loading-view');
    try {
        const cacheBuster = `&_t=${new Date().getTime()}`;
        const response = await fetch(subject.url + cacheBuster);
        if (!response.ok) throw new Error("No se pudo cargar el banco de preguntas.");
        
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        
        currentQuestions = [];
        // [BUG-003 Solucionado] Mapeo dinámico de opciones de respuesta
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (r.length >= 6 && r[1].trim() !== "") {
                let rawOptions = [];
                for (let j = 2; j < r.length - 1; j++) {
                    if (r[j] && r[j].trim() !== "") {
                        rawOptions.push(r[j].trim());
                    }
                }

                currentQuestions.push({
                    category: r[0].trim(),
                    question: r[1].trim(),
                    options: rawOptions,
                    correctAnswer: r[r.length - 1].trim()
                });
            }
        }

        if (currentQuestions.length === 0) {
            alert("Esta materia no tiene preguntas configuradas.");
            showSubjectsView();
            return;
        }

        // Barajar preguntas aleatoriamente
        currentQuestions.sort(() => Math.random() - 0.5);
        currentQuestionIndex = 0;
        score = 0;

        const titleEl = document.getElementById("quiz-subject-title");
        if (titleEl) titleEl.innerText = subject.name;

        showView('quiz-view');
        renderQuestion();
    } catch (err) {
        console.error(err);
        alert("Error al cargar las preguntas de la materia.");
        showSubjectsView();
    }
}

function renderQuestion() {
    if (currentQuestionIndex >= currentQuestions.length || currentQuestionIndex >= 10) {
        showResults();
        return;
    }

    const q = currentQuestions[currentQuestionIndex];
    const progressEl = document.getElementById("question-progress");
    const containerEl = document.getElementById("question-container");
    
    if (progressEl) progressEl.innerText = `Pregunta ${currentQuestionIndex + 1} de ${Math.min(10, currentQuestions.length)}`;
    if (containerEl) containerEl.innerText = q.question;

    const optionsContainer = document.getElementById("options-container");
    if (!optionsContainer) return;
    optionsContainer.innerHTML = "";

    if (!q.options || q.options.length === 0) {
        optionsContainer.innerHTML = `<p style="color: var(--accent-yellow);">Esta pregunta no contiene opciones válidas.</p>`;
        return;
    }

    // Barajar opciones
    let shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);

    shuffledOptions.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.innerText = opt;
        btn.onclick = () => selectAnswer(opt, q.correctAnswer, btn);
        optionsContainer.appendChild(btn);
    });
}

function selectAnswer(selected, correct, btnElement) {
    const buttons = document.querySelectorAll(".option-btn");
    buttons.forEach(b => b.onclick = null); // Deshabilitar clics múltiples

    const cleanSelected = selected.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const cleanCorrect = correct.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

    const isCorrect = (cleanSelected === cleanCorrect);
    playSound(isCorrect); // [BUG-002 Solucionado] Feedback auditivo Web Audio API

    if (isCorrect) {
        btnElement.classList.add("correct");
        score++;
    } else {
        btnElement.classList.add("incorrect");
        buttons.forEach(b => {
            const cleanB = b.innerText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
            if (cleanB === cleanCorrect) b.classList.add("correct");
        });
    }

    setTimeout(() => {
        currentQuestionIndex++;
        renderQuestion();
    }, 1200);
}

function showResults() {
    showView('results-view');
    const total = Math.min(10, currentQuestions.length);
    const scoreEl = document.getElementById("final-score");
    if (scoreEl) scoreEl.innerText = `${score} / ${total}`;
    
    // Otorgar 5 puntos EP por cada acierto [EPIC-06]
    const earnedEP = score * 5;
    userStats.ep += earnedEP;
    saveUserStats();
    updateEgoBarUI();

    let feedback = `¡Entrenamiento completado! Ganaste +${earnedEP} Puntos EP.`;
    if (score === total) feedback = `¡Rendimiento perfecto! +${earnedEP} EP. Nivel Ego Estelar alcanzado ⚽🔥`;
    
    const feedbackEl = document.getElementById("results-feedback");
    if (feedbackEl) feedbackEl.innerText = feedback;
}

function confirmLeaveQuiz() {
    if (confirm("¿Estás seguro de salir? Perderás tu progreso actual.")) {
        showSubjectsView();
    }
}

function showSubjectsView() {
    showView('subjects-view');
}

window.onload = initApp;