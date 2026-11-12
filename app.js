        const CONFIG_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRGBmoGizzNKU8G5AAHx0B7X929ljOcclcnx7enTgDLixnaJ3Xn61buqcb8BkRGTt16qIUjQQKFIJch/pub?gid=112265702&single=true&output=csv';

    let SUBJECT_CATALOG = [];
    let modulesData = {}; 
    let currentQueue = [];
    let currentQuestion = null;
    let stats = { correct: 0, attempts: 0 };
    let currentSubjectName = '';
    let quizActive = false;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;

    function initAudio() {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('touchstart', initAudio, { once: true });

    function playSound(type) {
        try {
            initAudio();
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            const now = audioCtx.currentTime;
            if (type === 'correct') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(500, now);
                osc.frequency.exponentialRampToValueAtTime(1000, now + 0.15);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            } else {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(250, now);
                osc.frequency.exponentialRampToValueAtTime(100, now + 0.25);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            }
        } catch (e) { console.log("Audio error:", e); }
    }

    function parseCSV(text) {
        let result = [], row = [], cell = '', insideQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i], nextChar = text[i + 1];
            if (char === '"' && insideQuotes && nextChar === '"') { cell += '"'; i++; }
            else if (char === '"') { insideQuotes = !insideQuotes; }
            else if (char === ',' && !insideQuotes) { row.push(cell.trim()); cell = ''; }
            else if ((char === '\n' || char === '\r') && !insideQuotes) {
                if (char === '\r' && nextChar === '\n') i++; 
                row.push(cell.trim());
                if(row.join('') !== '') result.push(row);
                row = []; cell = '';
            } else { cell += char; }
        }
        if (cell || row.length > 0) { row.push(cell.trim()); result.push(row); }
        return result;
    }

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        quizActive = (id === 'quiz');
    }

    function confirmChangeSubject() {
        if (quizActive && currentQueue.length > 0) {
            if (confirm("⚠️ ¿Estás seguro de salir? Perderás el progreso de tu entrenamiento actual en la cancha.")) {
                quizActive = false;
                showScreen('subject-select');
            }
        } else {
            showScreen('subject-select');
        }
    }

    async function initApp() {
        try {
            const cacheBusterUrl = CONFIG_CSV_URL + '&t=' + Date.now();
            const response = await fetch(cacheBusterUrl);
            if (!response.ok) throw new Error("Error HTTP: " + response.status);
            
            const csvText = await response.text();
            const data = parseCSV(csvText);
            
            SUBJECT_CATALOG = [];
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (row.length < 3) continue;
                if (row[0] === 'Setting' && row[1] === 'AppTitle') {
                    document.getElementById('app-title').innerText = '⚽ ' + row[2].replace('v1.0', 'v1.7');
                } else if (row[0] === 'Subject') {
                    SUBJECT_CATALOG.push({ id: row[1], name: row[2], icon: row[3], url: row[4] });
                }
            }
            renderSubjects();
        } catch (error) {
            document.getElementById('loader').innerHTML = `
                ❌ Error de conexión con la Academia.<br><br>
                <button class="action-btn" style="width: auto; background: var(--accent); color: #090d16;" onclick="initApp()">🔄 Reintentar Conexión</button>`;
        }
    }

    function renderSubjects() {
        const grid = document.getElementById('subject-grid');
        grid.innerHTML = '';
        SUBJECT_CATALOG.forEach(subject => {
            const btn = document.createElement('button');
            btn.className = 'card-btn subject-card';
            btn.innerHTML = `<span class="card-icon">${subject.icon}</span> <span>${subject.name}</span>`;
            btn.onclick = () => { initAudio(); loadSubjectData(subject.url, subject.name); };
            grid.appendChild(btn);
        });
        showScreen('subject-select');
    }

    async function loadSubjectData(csvUrl, subjectName) {
        currentSubjectName = subjectName;
        document.getElementById('loader-text').innerText = `Cargando datos de ${subjectName}...`;
        showScreen('loader');
        modulesData = {}; 

        if (!csvUrl) {
            document.getElementById('loader').innerHTML = '❌ URL no configurada para ' + subjectName;
            return;
        }

        try {
            const cacheBusterUrl = csvUrl + (csvUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
            const response = await fetch(cacheBusterUrl);
            if (!response.ok) throw new Error("Fallo de red");

            const csvText = await response.text();
            const data = parseCSV(csvText);
            
            let hasData = false;
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (row.length < 8 || !row[0]) continue; 
                hasData = true;
                
                const category = row[0];
                const activityType = row[8] ? row[8].trim().toLowerCase() : 'multiple_choice';

                const qObj = {
                    question: row[1],
                    options: [row[2], row[3], row[4]].filter(Boolean),
                    correctAnswer: row[5],
                    explanation: row[6],
                    difficulty: row[7],
                    type: activityType
                };

                if (!modulesData[category]) modulesData[category] = [];
                modulesData[category].push(qObj);
            }

            if (!hasData) {
                document.getElementById('loader').innerHTML = `
                    <div style="font-size: 3rem; margin-bottom:10px;">📋</div>
                    No hay datos en ${subjectName}.<br><br>
                    <button class="action-btn back-btn" onclick="showScreen('subject-select')">Volver</button>`;
            } else {
                renderDashboard();
            }
        } catch (error) {
            document.getElementById('loader').innerHTML = `
                ❌ Error al cargar ${subjectName}.<br><br>
                <button class="action-btn" style="width: auto; background: var(--accent); color: #090d16;" onclick="loadSubjectData('${csvUrl}', '${subjectName}')">🔄 Reintentar</button>`;
        }
    }

    function renderDashboard() {
        document.getElementById('current-subject-title').innerText = `${currentSubjectName}`;
        const grid = document.getElementById('module-grid');
        grid.innerHTML = '';
        
        Object.keys(modulesData).forEach(category => {
            const card = document.createElement('button');
            card.className = 'card-btn';
            card.innerText = category;
            card.onclick = () => { initAudio(); startModule(category); };
            grid.appendChild(card);
        });
        showScreen('dashboard');
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function removeAccents(str) {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    }

    function startModule(category) {
        initAudio(); 
        currentQueue = shuffleArray(JSON.parse(JSON.stringify(modulesData[category])));
        stats = { correct: 0, attempts: 0 };
        showScreen('quiz');
        loadNextQuestion();
    }

    function updateStats() {
        document.getElementById('attempts-count').innerText = stats.attempts;
        document.getElementById('correct-count').innerText = stats.correct;
        document.getElementById('queue-count').innerText = currentQueue.length;
    }

    function loadNextQuestion() {
        if (currentQueue.length === 0) return endModule();
        
        currentQuestion = currentQueue[0];
        updateStats();

        const diffEl = document.getElementById('q-difficulty');
        diffEl.innerText = currentQuestion.difficulty;
        diffEl.className = `difficulty-badge diff-${currentQuestion.difficulty}`;
        
        document.getElementById('q-text').innerHTML = '';
        document.getElementById('feedback-panel').style.display = 'none';

        const container = document.getElementById('activity-container');
        container.innerHTML = '';

        if (currentQuestion.type === 'true_false') {
            document.getElementById('q-text').innerText = currentQuestion.question;
            renderTrueFalse(container);
        } else if (currentQuestion.type === 'fill_blanks') {
            renderFillBlanks(container);
        } else if (currentQuestion.type === 'matching') {
            document.getElementById('q-text').innerText = currentQuestion.question;
            renderMatching(container);
        } else {
            document.getElementById('q-text').innerText = currentQuestion.question;
            renderMultipleChoice(container);
        }
    }

    function renderMultipleChoice(container) {
        const optContainer = document.createElement('div');
        optContainer.className = 'options-container';
        
        const shuffled = shuffleArray([...currentQuestion.options]);
        shuffled.forEach(optText => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.innerText = optText;
            btn.onclick = () => {
                initAudio();
                const isCorrect = (optText === currentQuestion.correctAnswer);
                if (isCorrect) btn.classList.add('correct');
                else {
                    btn.classList.add('incorrect');
                    optContainer.querySelectorAll('.option-btn').forEach(b => {
                        if(b.innerText === currentQuestion.correctAnswer) b.classList.add('correct');
                    });
                }
                optContainer.querySelectorAll('button').forEach(b => b.disabled = true);
                processAnswer(isCorrect);
            };
            optContainer.appendChild(btn);
        });
        container.appendChild(optContainer);
    }

    function renderTrueFalse(container) {
        const optContainer = document.createElement('div');
        optContainer.className = 'options-container';
        
        ['True', 'False'].forEach(optText => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.innerText = optText;
            btn.onclick = () => {
                initAudio();
                let userVal = removeAccents(optText);
                let correctVal = removeAccents(currentQuestion.correctAnswer);
                
                if (userVal === 'verdadero' || userVal === 'true' || userVal === 'v') userVal = 'true';
                if (userVal === 'falso' || userVal === 'false' || userVal === 'f') userVal = 'false';
                
                if (correctVal === 'verdadero' || correctVal === 'true' || correctVal === 'v') correctVal = 'true';
                if (correctVal === 'falso' || correctVal === 'false' || correctVal === 'f') correctVal = 'false';

                const isCorrect = (userVal === correctVal);
                
                if (isCorrect) {
                    btn.classList.add('correct');
                } else {
                    btn.classList.add('incorrect');
                    optContainer.querySelectorAll('.option-btn').forEach(b => {
                        let bVal = removeAccents(b.innerText);
                        if (bVal === 'verdadero' || bVal === 'true') bVal = 'true';
                        if (bVal === 'falso' || bVal === 'false') bVal = 'false';
                        if(bVal === correctVal) b.classList.add('correct');
                    });
                }
                optContainer.querySelectorAll('button').forEach(b => b.disabled = true);
                processAnswer(isCorrect);
            };
            optContainer.appendChild(btn);
        });
        container.appendChild(optContainer);
    }

    function renderFillBlanks(container) {
        const qTextEl = document.getElementById('q-text');
        
        let rawQuestion = currentQuestion.question || "";
        let formattedHTML = rawQuestion.replace(/\[\s*blank\s*\]/gi, '<input type="text" id="inline-blank-field" class="inline-blank-input" autocomplete="off">');
        qTextEl.innerHTML = formattedHTML;

        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.innerText = 'Enviar Respuesta ⚽';
        
        const handleSubmit = () => {
            initAudio();
            const inputField = document.getElementById('inline-blank-field');
            if(!inputField || inputField.disabled) return;

            const userAns = removeAccents(inputField.value);
            const correctAns = removeAccents(currentQuestion.correctAnswer);
            const isCorrect = (userAns === correctAns);
            
            inputField.disabled = true;
            btn.disabled = true;
            
            if (isCorrect) {
                inputField.style.borderColor = 'var(--correct)';
                inputField.style.backgroundColor = 'rgba(16,185,129,0.2)';
            } else {
                inputField.style.borderColor = 'var(--incorrect)';
                inputField.style.backgroundColor = 'rgba(239,68,68,0.2)';
            }
            
            processAnswer(isCorrect);
        };

        btn.onclick = handleSubmit;
        
        setTimeout(() => {
            const inp = document.getElementById('inline-blank-field');
            if(inp) {
                inp.focus();
                inp.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') handleSubmit();
                });
            }
        }, 100);
        
        container.appendChild(btn);
    }

    function renderMatching(container) {
        const wrap = document.createElement('div');
        wrap.className = 'matching-grid';
        
        const leftCol = document.createElement('div'); leftCol.className = 'match-col';
        const rightCol = document.createElement('div'); rightCol.className = 'match-col';
        
        let pairs = [];
        currentQuestion.options.forEach(opt => {
            if(opt.includes('=')) {
                let parts = opt.split('=');
                pairs.push({ left: parts[0].trim(), right: parts[1].trim() });
            }
        });
        
        let leftItems = shuffleArray(pairs.map(p => p.left));
        let rightItems = shuffleArray(pairs.map(p => p.right));
        let matchesLeft = pairs.length;
        
        let selectedLeftBtn = null;
        let selectedRightBtn = null;

        function checkMatch() {
            if (selectedLeftBtn && selectedRightBtn) {
                initAudio();
                const lText = selectedLeftBtn.innerText;
                const rText = selectedRightBtn.innerText;
                
                const isMatch = pairs.some(p => p.left === lText && p.right === rText);
                
                if (isMatch) {
                    playSound('correct');
                    selectedLeftBtn.classList.replace('selected', 'matched');
                    selectedRightBtn.classList.replace('selected', 'matched');
                    selectedLeftBtn = null;
                    selectedRightBtn = null;
                    matchesLeft--;
                    
                    if (matchesLeft === 0) {
                        setTimeout(() => processAnswer(true), 500);
                    }
                } else {
                    playSound('incorrect');
                    selectedLeftBtn.classList.add('error');
                    selectedRightBtn.classList.add('error');
                    
                    setTimeout(() => {
                        selectedLeftBtn.classList.remove('error', 'selected');
                        selectedRightBtn.classList.remove('error', 'selected');
                        selectedLeftBtn = null;
                        selectedRightBtn = null;
                    }, 400);
                    
                    const allBtns = wrap.querySelectorAll('.match-btn');
                    allBtns.forEach(b => b.disabled = true);
                    processAnswer(false);
                }
            }
        }

        leftItems.forEach(text => {
            const btn = document.createElement('button');
            btn.className = 'match-btn'; btn.innerText = text;
            btn.onclick = () => {
                initAudio();
                if(btn.classList.contains('matched')) return;
                if(selectedLeftBtn) selectedLeftBtn.classList.remove('selected');
                selectedLeftBtn = btn;
                btn.classList.add('selected');
                checkMatch();
            };
            leftCol.appendChild(btn);
        });

        rightItems.forEach(text => {
            const btn = document.createElement('button');
            btn.className = 'match-btn'; btn.innerText = text;
            btn.onclick = () => {
                initAudio();
                if(btn.classList.contains('matched')) return;
                if(selectedRightBtn) selectedRightBtn.classList.remove('selected');
                selectedRightBtn = btn;
                btn.classList.add('selected');
                checkMatch();
            };
            rightCol.appendChild(btn);
        });

        wrap.appendChild(leftCol);
        wrap.appendChild(rightCol);
        container.appendChild(wrap);
    }

    function processAnswer(isCorrect) {
        stats.attempts++;
        const feedback = document.getElementById('feedback-panel');
        const fTitle = document.getElementById('feedback-title');
        const fExp = document.getElementById('feedback-explanation');

        if (isCorrect) {
            playSound('correct');
            stats.correct++;
            fTitle.innerText = "⚽ ¡Golazo Mental! ¡Excelente Visión de Campo!";
            fTitle.style.color = "var(--correct)";
            feedback.className = "feedback correct-bg";
            fExp.innerHTML = `<strong>Explicación Táctica:</strong> ${currentQuestion.explanation}`;
            currentQueue.shift();
        } else {
            playSound('incorrect');
            fTitle.innerText = "🚩 ¡Fuera de Lugar! Analiza la Jugada:";
            fTitle.style.color = "var(--incorrect)";
            feedback.className = "feedback incorrect-bg";
            fExp.innerHTML = `<strong>Respuesta Correcta:</strong> <span style="color:var(--accent); font-weight:bold;">${currentQuestion.correctAnswer}</span><br><br><strong>Explicación Táctica:</strong> ${currentQuestion.explanation}`;
            
            const failedQ = currentQueue.shift();
            currentQueue.push(failedQ);
        }

        updateStats();
        feedback.style.display = 'block';
        feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    document.getElementById('next-btn').onclick = () => { initAudio(); loadNextQuestion(); };

    function endModule() {
        quizActive = false;
        document.getElementById('sum-correct').innerText = stats.correct;
        document.getElementById('sum-attempts').innerText = stats.attempts;
        showScreen('summary');
    }

    initApp();
