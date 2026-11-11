// URL de publicación CSV del AppConfig oficial
const APP_CONFIG_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRGBmoGizzNKU8G5AAHx0B7X929ljOcclcnx7enTgDLixnaJ3Xn61buqcb8BkRGTt16qIUjQQKFIJch/pub?gid=0&single=true&output=csv";

let subjectsCatalog = [];
let currentQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let activeQuizSubject = "";

// Estado de Gamificación (EPIC-06)
let userStats = {
    streak: 0,
    ep: 0,
    rank: "Novato",
    lastLoginDate: ""
};

// Cargar estadísticas de localStorage al iniciar
function loadUserStats() {
    try {
        const saved = localStorage.getItem("study_hub_user_stats");
        if (saved) {
            userStats = JSON.parse(saved);
        }
        checkStreak();
    } catch (e) {
        console.error("Error al leer localStorage:", e);
    }
    updateEgoBarUI();
}

// Lógica de rachas diarias (EPIC-06)
function checkStreak() {
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
            userStats.streak = 1; // Racha rota
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

// Calcular rangos de futbolista basados en EP (Puntos de Experiencia)
function updateEgoRank() {
    if (userStats.ep >= 100) userStats.rank = "Delantero Estrella ⭐";
    else if (userStats.ep >= 50) userStats.rank = "Titular Convictivo ⚽";
    else if (userStats.ep >= 20) userStats.rank = "Juvenil Promesa 🏃‍♂️";
    else userStats.rank = "Novato 🐣";
}

function updateEgoBarUI() {
    updateEgoRank();
    document.getElementById("streak-count").innerText = userStats.streak;
    document.getElementById("ep-score").innerText = userStats.ep;
    document.getElementById("ego-rank").innerText = userStats.rank;
}

// Parser CSV robusto
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
        console.error("Fallo de red:", err);
        showView('error-view');
    }
}

function showView(viewId) {
    ['loading-view', 'error-view', 'subjects-view', 'quiz-view', 'results-view'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(viewId).classList.remove('hidden');
}

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

async function loadSubjectQuiz(subject) {
    activeQuizSubject = subject.name;
    showView('loading-view');
    try {
        const cacheBuster = `&_t=${new Date().getTime()}`;
        const response = await fetch(subject.url + cacheBuster);
        if (!response.ok) throw new Error("No se pudo cargar el banco.");
        
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        
        currentQuestions = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
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
            alert("Esta materia no tiene preguntas.");
            showSubjectsView();
            return;
        }

        currentQuestions.sort(() => Math.random() - 0.5);
        currentQuestionIndex = 0;
        score = 0;

        document.getElementById("quiz-subject-title").innerText = subject.name;
        showView('quiz-view');
        renderQuestion();
    } catch (err) {
        console.error(err);
        alert("Error al cargar preguntas.");
        showSubjectsView();
    }
}

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
    buttons.forEach(b => b.onclick = null);

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

    setTimeout(() => {
        currentQuestionIndex++;
        renderQuestion();
    }, 1200);
}

function showResults() {
    showView('results-view');
    const total = Math.min(10, currentQuestions.length);
    document.getElementById("final-score").innerText = `${score} / ${total}`;
    
    // Otorgar Puntos de Experiencia (EP) según aciertos (EPIC-06)
    const earnedEP = score * 5;
    userStats.ep += earnedEP;
    saveUserStats();
    updateEgoBarUI();

    let feedback = `¡Entrenamiento completado! Ganaste +${earnedEP} Puntos EP.`;
    if (score === total) feedback = `¡Rendimiento perfecto! +${earnedEP} EP. Nivel Ego Estelar alcanzado ⚽🔥`;
    
    document.getElementById("results-feedback").innerText = feedback;
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
