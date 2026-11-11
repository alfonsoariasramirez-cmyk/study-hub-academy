/**
 * Study Hub Academy - Lógica Principal (v2.0)
 * Arquitectura modular cliente-servidor con integración a Google Sheets CMS y Gamificación.
 */
console.log("Inicia carga de app.js")
// URL de publicación CSV del AppConfig oficial (v1.4 - v2.0)
const APP_CONFIG_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRGBmoGizzNKU8G5AAHx0B7X929ljOcclcnx7enTgDLixnaJ3Xn61buqcb8BkRGTt16qIUjQQKFIJch/pub?gid=112265702&single=true&output=csv";

// Estado global de la aplicación
let subjectsCatalog = [];
let currentQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let activeQuizSubject = "";

/**
 * ============================================================================
 * *[EPIC-06] SISTEMA DE GAMIFICACIÓN, RACHAS Y PUNTOS DE EGO (LOCALSTORAGE)
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
 * Implementa manejo defensivo de errores (try/catch) ante datos corruptos (TC-020).
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
 * Si entra al día siguiente, incrementa la racha; si pasan más días, la reinicia.
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
    console.log("Inicia updateEgoRank");
    if (userStats.ep >= 100) userStats.rank = "Delantero Estrella ⭐";
    else if (userStats.ep >= 50) userStats.rank = "Titular Convictivo ⚽";
    else if (userStats.ep >= 20) userStats.rank = "Juvenil Promesa 🏃‍♂️";
    else userStats.rank = "Novato 🐣";
}

/**
 * Actualiza los elementos DOM de la barra superior con los valores de racha y EP.
 */
function updateEgoBarUI() {
    console.log("Inicia updateEgoBarUI");
    updateEgoRank();
    document.getElementById("streak-count").innerText = userStats.streak;
    document.getElementById("ep-score").innerText = userStats.ep;
    document.getElementById("ego-rank").innerText = userStats.rank;
}

/**
 * ============================================================================
 * MOTOR DE PARSEO CSV Y GESTIÓN DE VISTAS (CMS)
 * ============================================================================
 */

/**
 * Analizador CSV robusto capaz de manejar comillas dobles, comas internas y saltos de línea (TC-016).
 * @param {string} text - Texto crudo obtenido del archivo CSV remoto.
 * @returns {Array<Array<string>>} Matriz bidimensional de filas y columnas.
 */
function parseCSV(text) {
    console.log("Inicia parseCSV");
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

/**
 * Inicializa la aplicación cargando el catálogo central de materias desde Google Sheets.
 * Implementa control de caché dinámico mediante parámetros timestamp (TASK-504).
 */
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
                document.getElementById("app-title").innerText = r[2].trim();
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

/**
 * Controla la visibilidad de las vistas principales de la SPA (Single Page Application).
 * @param {string} viewId - ID del contenedor que se desea mostrar.
 */
function showView(viewId) {
    ['loading-view', 'error-view', 'subjects-view', 'quiz-view', 'results-view'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(viewId).classList.remove('hidden');
}

/**
 * Renderiza dinámicamente las tarjetas de materias en el menú principal.
 */
function renderSubjects() {
    const grid = document.getElementById("subjects-grid");
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
 * Carga de manera asíncrona el banco de preguntas específico de la materia seleccionada.
 * @param {Object} subject - Objeto que contiene la metadata y URL del CSV de la materia.
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
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            // Filtrado tolerante a filas incompletas o vacías (TC-017)
            if (r.length >= 6 && r[1].trim() !== "") {
                currentQuestions.push({
                    category: r[0].trim(),
                    question: r[1].trim(),
                    options: [r[2].trim(), r[3].trim(), r[4].trim()].filter(opt => opt !== ""),
                    correctAnswer: r[5].trim()
                });
            }
        }

        if (currentQuestions.length === 0) {
            alert("Esta materia no tiene preguntas configuradas.");
            showSubjectsView();
            return;
        }

        // Aleatorizar preguntas (Shuffle)
        currentQuestions.sort(() => Math.random() - 0.5);
        currentQuestionIndex = 0;
        score = 0;

        document.getElementById("quiz-subject-title").innerText = subject.name;
        showView('quiz-view');
        renderQuestion();
    } catch (err) {
        console.error(err);
        alert("Error al cargar las preguntas de la materia.");
        showSubjectsView();
    }
}

/**
 * Renderiza la pregunta actual y sus opciones con orden aleatorio.
 */
function renderQuestion() {
    if (currentQuestionIndex >= currentQuestions.length || currentQuestionIndex >= 10) {
        showResults();
        return;
    }

    const q = currentQuestions[currentQuestionIndex];
    document.getElementById("question-progress").innerText = `Pregunta ${currentQuestionIndex + 1} de ${Math.min(10, currentQuestions.length)}`;
    document.getElementById("question-container").innerText = q.question;

    const optionsContainer = document.getElementById("options-container");
    optionsContainer.innerHTML = "";

    // Barajar opciones de respuesta
    let shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);

    shuffledOptions.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.innerText = opt;
        btn.onclick = () => selectAnswer(opt, q.correctAnswer, btn);
        optionsContainer.appendChild(btn);
    });
}

/**
 * Valida la respuesta seleccionada por el estudiante y aplica normalización Unicode de texto (TASK-201).
 * @param {string} selected - Opción elegida por el usuario.
 * @param {string} correct - Respuesta oficial correcta.
 * @param {HTMLElement} btnElement - Elemento de botón presionado.
 */
function selectAnswer(selected, correct, btnElement) {
    const buttons = document.querySelectorAll(".option-btn");
    buttons.forEach(b => b.onclick = null); // Deshabilitar clics múltiples

    // Normalización de acentos y mayúsculas para comparación robusta
    const cleanSelected = selected.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const cleanCorrect = correct.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

    if (cleanSelected === cleanCorrect) {
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
    document.getElementById("final-score").innerText = `${score} / ${total}`;
    
    // Otorgar 5 puntos EP por cada acierto obtenido
    const earnedEP = score * 5;
    userStats.ep += earnedEP;
    saveUserStats();
    updateEgoBarUI();

    let feedback = `¡Entrenamiento completado! Ganaste +${earnedEP} Puntos EP.`;
    if (score === total) feedback = `¡Rendimiento perfecto! +${earnedEP} EP. Nivel Ego Estelar alcanzado ⚽🔥`;
    
    document.getElementById("results-feedback").innerText = feedback;
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