    // URL de publicación CSV del AppConfig oficial (v1.4 - v1.7)
    const APP_CONFIG_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRGBmoGizzNKU8G5AAHx0B7X929ljOcclcnx7enTgDLixnaJ3Xn61buqcb8BkRGTt16qIUjQQKFIJch/pub?gid=112265702&single=true&output=csv";

    let subjectsCatalog = [];
    let currentQuestions = [];
    let currentQuestionIndex = 0;
    let score = 0;
    let activeQuizSubject = "";

    // Motor robusto de parseo CSV compatible con comillas y comas internas
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
        showView('loading-view');
        try {
            // Control de caché con timestamp dinámico (TASK-504)
            const cacheBuster = `&_t=${new Date().getTime()}`;
            const response = await fetch(APP_CONFIG_URL + cacheBuster);
            if (!response.ok) throw new Error("Error HTTP: " + response.status);
            
            const csvText = await response.text();
            const rows = parseCSV(csvText);
            
            subjectsCatalog = [];
            // Omitir cabecera (fila 0)
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

            if (subjectsCatalog.length === 0) {
                throw new Error("No se encontraron materias en el archivo de configuración.");
            }

            renderSubjects();
            showView('subjects-view');
        } catch (err) {
            console.error("Fallo de red o parseo:", err);
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
            if (!response.ok) throw new Error("No se pudo cargar el banco de preguntas.");
            
            const csvText = await response.text();
            const rows = parseCSV(csvText);
            
            currentQuestions = [];
            // Formato esperado: Category,Question,Option A,Option B,Option C,Correct Answer,Explanation,Difficulty,Activity_Type
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
                alert("Esta materia aún no tiene preguntas configuradas.");
                showSubjectsView();
                return;
            }

            // Barajar preguntas aleatoriamente
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
        // Deshabilitar botones para evitar doble clic
        const buttons = document.querySelectorAll(".option-btn");
        buttons.forEach(b => b.onclick = null);

        // Normalización para comparar respuestas sin tildes o mayúsculas (TASK-201)
        const cleanSelected = selected.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
        const cleanCorrect = correct.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

        if (cleanSelected === cleanCorrect) {
            btnElement.classList.add("correct");
            score++;
        } else {
            btnElement.classList.add("incorrect");
            buttons.forEach(b => {
                const cleanB = b.innerText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
                if (cleanB === cleanCorrect) {
                    b.classList.add("correct");
                }
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
        
        let feedback = "¡Buen trabajo! Sigue practicando para dominar la materia.";
        if (score === total) feedback = "¡Rendimiento perfecto! Nivel Ego Estelar alcanzado ⚽🔥";
        else if (score >= total * 0.8) feedback = "¡Excelente desempeño! Estás listo para el torneo.";
        
        document.getElementById("results-feedback").innerText = feedback;
    }

    // Prevención de pérdida de sesión al cambiar de materia por accidente (TASK-503)
    function confirmLeaveQuiz() {
        if (confirm("¿Estás seguro de que deseas salir? Perderás el progreso de tu cuestionario actual.")) {
            showSubjectsView();
        }
    }

    function showSubjectsView() {
        showView('subjects-view');
    }

    // Inicializar al cargar la página
    window.onload = initApp;
