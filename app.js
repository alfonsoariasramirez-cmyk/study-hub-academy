/**
 * Study Hub Academy - Lógica Principal (v2.0)
 * Arquitectura modular cliente-servidor con integración a Google Sheets CMS y Gamificación.
 */
console.log("Inicia carga de app.js");

// URL de publicación CSV del AppConfig oficial (v1.4 - v2.0)
const APP_CONFIG_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRGBmoGizzNKU8G5AAHx0B7X929ljOcclcnx7enTgDLixnaJ3Xn61buqcb8BkRGTt16qIUjQQKFIJch/pub?gid=112265702&single=true&output=csv";

// Estado global de la aplicación
let subjectsCatalog = [];
let currentRawQuestions = []; // Almacena todo el banco de la materia para filtrar por módulo
let currentQuestions = [];    // Preguntas activas del módulo seleccionado
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

/**
 * Carga las estadísticas del usuario desde el almacenamiento local del navegador.
 */
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

/**
 * Valida y calcula la racha de días consecutivos de estudio del estudiante.
 */
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
            userStats.streak = 1; // Racha interrumpida
            userStats.lastLoginDate = today;
        }
    }
    saveUserStats();
}

/**
 * Persiste las estadísticas actuales en el localStorage del navegador.
 */
function saveUserStats() {
    console.log("saveUserStats");
    try {
        localStorage.setItem("study_hub_user_stats", JSON.stringify(userStats));
    } catch (e) {
        console.error("Error al guardar en localStorage:", e);
    }
}

/**
 * Calcula el rango del estudiante basándose en sus Puntos de Experiencia (EP).
 */
function updateEgoRank() {
    if (userStats.ep >= 100) userStats.rank = "Delantero Estrella ⭐";
    else if (userStats.ep >= 50) userStats.rank = "Titular Convictivo ⚽";
    else if (userStats.ep >= 20) userStats.rank = "Juvenil Promesa 🏃‍♂️";
    else userStats.rank = "Novato 🐣";
}

/**
 * Actualiza los elementos DOM de la barra superior con los valores de racha y EP.
 */
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
 * EFECTOS DE AUDIO (Web Audio API - Estilo Shonen / Tsubasa)
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
        osc.frequency.setValueAtTime(isCorrect ? 587.33 : 220, ctx.currentTime); // D5 para acierto, A3 para error
        
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
    // Incluimos también la vista de módulos si existe en el DOM
    ['loading-view', 'error-view', 'subjects-view', 'modules-view', 'quiz-view', 'results-view'].forEach(id => {
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
        card.onclick = () => loadSubjectData(sub);
        grid.appendChild(card);
    });
}

/**
 * Carga el banco de preguntas de la materia y procede a mostrar los módulos (categorías).
 */
async function loadSubjectData(subject) {
    activeQuizSubject = subject.name;
    showView('loading-view');
    try {
        const cacheBuster = `&_t=${new Date().getTime()}`;
        const response = await fetch(subject.url + cacheBuster);
        if (!response.ok) throw new Error("No se pudo cargar el banco de preguntas.");
        
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        
        currentRawQuestions = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            // Mapeo flexible de columnas para soportar opción múltiple y otros reactivos
            if (r.length >= 6 && r[1].trim() !== "") {
                // Extraer todas las opciones dinámicamente desde el índice 2 hasta antes de la respuesta correcta
                let rawOptions = [];
                for (let j = 2; j < r.length - 1; j++) {
                    if (r[j] && r[j].trim() !== "") {
                        rawOptions.push(r[j].trim());
                    }
                }

                currentRawQuestions.push({
                    category: r[0].trim(),
                    question: r[1].trim(),
                    options: rawOptions,
                    correctAnswer: r[r.length - 1].trim()
                });
            }
        }

        if (currentRawQuestions.length === 0) {
            alert("Esta materia no tiene preguntas configuradas.");
            showSubjectsView();
            return;
        }

        renderModules(subject.name);
    } catch (err) {
        console.error(err);
        alert("Error al cargar las preguntas de la materia.");
        showSubjectsView();
    }
}

/**
 * Renderiza la pantalla de selección de Módulos (Categorías) específicos de la materia.
 */
function renderModules(subjectName) {
    // Si no existe una vista específica en el HTML, la creamos o utilizamos subjects-view como contenedor de módulos
    let modulesView = document.getElementById("modules-view");
    if (!modulesView) {
        // Fallback dinámico si el contenedor no está declarado en el HTML
        modulesView = document.createElement("div");
        modulesView.id = "modules-view";
        modulesView.className = "hidden p-4";
        document.body.appendChild(modulesView);
    }

    const categories = [...new Set(currentRawQuestions.map(q => q.category || "Módulo General"))];

    let html = `
        <div class="max-w-4xl mx-auto text-center py-6">
            <button onclick="showSubjectsView()" class="mb-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition">⬅ Volver a Materias</button>
            <h2 class="text-2xl font-black text-cyan-400 mb-2">${subjectName}</h2>
            <p class="text-gray-300 mb-6">Selecciona un módulo de entrenamiento táctico:</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
    `;

    categories.forEach(cat => {
        const count = currentRawQuestions.filter(q => q.category === cat).length;
        html += `
            <div onclick="startModuleQuiz('${cat}')" class="p-5 bg-slate-800/90 border border-cyan-500/40 rounded-xl cursor-pointer hover:bg-slate-700 hover:border-cyan-400 transition shadow-lg">
                <h3 class="font-bold text-lg text-white mb-1">📌 ${cat}</h3>
                <p class="text-sm text-cyan-300">${count} reactivos disponibles</p>
            </div>
        `;
    });

    html += `</div></div>`;
    modulesView.innerHTML = html;
    showView('modules-view');
}

/**
 * Inicia el cuestionario filtrando por el módulo seleccionado.
 */
function startModuleQuiz(category) {
    currentQuestions = currentRawQuestions.filter(q => q.category === category);
    currentQuestions.sort(() => Math.random() - 0.5); // Shuffle
    currentQuestionIndex = 0;
    score = 0;

    const titleEl = document.getElementById("quiz-subject-title");
    if (titleEl) titleEl.innerText = `${activeQuizSubject} - ${category}`;
    
    showView('quiz-view');
    renderQuestion();
}

/**
 * Renderiza la pregunta actual y sus opciones con orden aleatorio y soporte completo de reactivos.
 */
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

    // Asegurar que existan opciones para renderizar (evita celdas vacías)
    if (!q.options || q.options.length === 0) {
        optionsContainer.innerHTML = `<p class="text-yellow-400">Esta pregunta no contiene opciones válidas en el CSV.</p>`;
        return;
    }

    // Barajar opciones de respuesta de forma aleatoria
    let shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);

    shuffledOptions.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "option-btn w-full text-left p-3 my-2 bg-slate-800 hover:bg-cyan-900 border border-slate-700 rounded-lg transition text-white font-medium";
        btn.innerText = opt;
        btn.onclick = () => selectAnswer(opt, q.correctAnswer, btn);
        optionsContainer.appendChild(btn);
    });
}

/**
 * Valida la respuesta seleccionada, reproduce audio y normaliza comparación de textos.
 */
function selectAnswer(selected, correct, btnElement) {
    const buttons = document.querySelectorAll(".option-btn");
    buttons.forEach(b => b.onclick = null); // Deshabilitar clics múltiples

    // Normalización de acentos y mayúsculas para comparación robusta
    const cleanSelected = selected.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const cleanCorrect = correct.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

    const isCorrect = (cleanSelected === cleanCorrect);

    // Reproducir sonido sintetizado (Acierto o Error)
    playSound(isCorrect);

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

    // Transición automática a la siguiente pregunta tras 1.2 segundos
    setTimeout(() => {
        currentQuestionIndex++;
        renderQuestion();
    }, 1200);
}

/**
 * Muestra la pantalla de resultados y procesa la recompensa de Puntos de Experiencia [EPIC-06].
 */
function showResults() {
    showView('results-view');
    const total = Math.min(10, currentQuestions.length);
    const scoreEl = document.getElementById("final-score");
    if (scoreEl) scoreEl.innerText = `${score} / ${total}`;
    
    // Otorgar 5 puntos EP por cada acierto obtenido
    const earnedEP = score * 5;
    userStats.ep += earnedEP;
    saveUserStats();
    updateEgoBarUI();

    let feedback = `¡Entrenamiento completado! Ganaste +${earnedEP} Puntos EP.`;
    if (score === total) feedback = `¡Rendimiento perfecto! +${earnedEP} EP. Nivel Ego Estelar alcanzado ⚽🔥`;
    
    const feedbackEl = document.getElementById("results-feedback");
    if (feedbackEl) feedbackEl.innerText = feedback;
}

/**
 * Modal de confirmación para prevenir la pérdida involuntaria de sesión (TASK-503).
 */
function confirmLeaveQuiz() {
    if (confirm("¿Estás seguro de salir? Perderás tu progreso actual.")) {
        showSubjectsView();
    }
}

/**
 * Regresa a la vista principal de selección de materias.
 */
function showSubjectsView() {
    showView('subjects-view');
}

// Inicialización automática al cargar la ventana
window.onload = initApp;