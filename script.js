/**
 * MINT TYPING — HIGH PERFORMANCE CORE ENGINE
 * Sub-millisecond latency, zero-DOM-thrashing, multi-theme, synthesized mechanical audio,
 * O(1) caret updates, debounced I/O, and persistent practice telemetry.
 */

(function () {
    "use strict";

    const STORAGE_KEY = "mint_typing_sessions";
    const ACTIVE_SESSION_KEY = "mint_typing_active_session";

    const WORD_BANK = [
        "the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog", "precision", "result",
        "intention", "effort", "execution", "choice", "destiny", "kinetic", "monograph", "signal",
        "rhythm", "control", "focus", "speed", "session", "vector", "engine", "motion", "timing",
        "canvas", "editorial", "measure", "instant", "correct", "mistake", "keyboard", "practice",
        "accuracy", "flow", "repeat", "discipline", "memory", "habit", "target", "progress",
        "return", "future", "method", "stream", "energy", "design", "balance", "syntax", "clarity",
        "spectrum", "minimal", "dynamic", "tactile", "velocity", "terminal", "quantum", "matrix",
        "horizon", "digital", "analog", "surface", "structure", "circuit", "binary", "system"
    ];

    const KEYBOARD_ROWS = [
        "QWERTYUIOP",
        "ASDFGHJKL",
        "ZXCVBNM"
    ];

    // DOM References
    const textDisplay = document.getElementById("text-display");
    const hiddenInput = document.getElementById("hidden-input");
    const typingPanel = document.getElementById("typing-panel");
    const focusHint = document.getElementById("focus-hint");
    const timerVal = document.getElementById("timer-val");
    const timerLabel = document.getElementById("timer-label");
    const wpmVal = document.getElementById("wpm-val");
    const accNumber = document.getElementById("acc-number");
    const progressFill = document.getElementById("progress-fill");
    const restartBtn = document.getElementById("restart-btn");
    const resultsPanel = document.getElementById("results-panel");
    const finalWpm = document.getElementById("final-wpm");
    const finalAcc = document.getElementById("final-acc");
    const finalErrors = document.getElementById("final-errors");
    const finalMode = document.getElementById("final-mode");
    const finalDuration = document.getElementById("final-duration");
    const finalChars = document.getElementById("final-chars");
    const resultRestartBtn = document.getElementById("result-restart-btn");
    const sessionStatus = document.getElementById("session-status");
    const sessionId = document.getElementById("session-id");
    const historyCount = document.getElementById("history-count");
    const livePace = document.getElementById("live-pace");
    const velocityLine = document.getElementById("velocity-line");
    const velocityArea = document.getElementById("velocity-area");
    const keyboardHeatmap = document.getElementById("keyboard-heatmap");
    const topKey = document.getElementById("top-key");
    const clearHistoryBtn = document.getElementById("clear-history-btn");
    const historyTableBody = document.getElementById("history-table-body");

    // Engine State
    const state = {
        mode: "practice", // practice (25 words), timed (30s), focus (75 words)
        chars: [],
        currentIndex: 0,
        timerId: null,
        telemetryTimerId: null,
        started: false,
        finished: false,
        startTime: null,
        elapsedSeconds: 0,
        totalWords: 25,
        totalTime: 30,
        timeLeft: 30,
        resultSaved: false,
        velocity: [],
        keyCounts: {},
        sessionId: "0001",
        soundEnabled: false,
        totalErrors: 0,
        totalKeypresses: 0
    };

    // Performance Caches (Eliminates O(N) DOM query thrashing)
    let cachedCharSpans = [];
    let keyCapElementsMap = new Map();
    let persistDebounceTimer = null;

    // --------------------------------------------------------------------------
    // SYNTHESIZED MECHANICAL KEYCLICK SOUND (Web Audio API)
    // Zero external assets, 0ms latency, tactile clicks synthesized via oscillators
    // --------------------------------------------------------------------------
    let audioCtx = null;

    function initAudio() {
        if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContextClass();
        }
        if (audioCtx && audioCtx.state === "suspended") {
            audioCtx.resume();
        }
    }

    function playKeyClick(isSpace = false, isError = false) {
        if (!state.soundEnabled) return;
        try {
            initAudio();
            if (!audioCtx) return;

            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            if (isError) {
                // Sharper metallic error "clack"
                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(140, now);
                osc.frequency.exponentialRampToValueAtTime(60, now + 0.04);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
            } else if (isSpace) {
                // Deep mechanical spacebar "thud"
                osc.type = "sine";
                osc.frequency.setValueAtTime(180, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.06);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
            } else {
                // Crisp clicky mechanical switch (Cherry MX Blue / Brown profile)
                osc.type = "triangle";
                const baseFreq = 420 + Math.random() * 80;
                osc.frequency.setValueAtTime(baseFreq, now);
                osc.frequency.exponentialRampToValueAtTime(110, now + 0.025);
                gain.gain.setValueAtTime(0.09, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
            }

            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + (isSpace ? 0.06 : 0.035));
        } catch {
            // Audio unavailable
        }
    }

    // Sync sound state
    try {
        state.soundEnabled = localStorage.getItem("mint_typing_sound") === "on";
    } catch {
        state.soundEnabled = false;
    }
    window.addEventListener("mintsoundschanged", (e) => {
        state.soundEnabled = Boolean(e.detail && e.detail.enabled);
        if (state.soundEnabled) initAudio();
    });

    // --------------------------------------------------------------------------
    // CONFIGURATION & WORD GENERATION
    // --------------------------------------------------------------------------
    function getConfig() {
        if (state.mode === "timed") {
            return {
                label: "Time Left",
                wordCount: 70,
                totalTime: 30,
                endType: "time"
            };
        }
        if (state.mode === "focus") {
            return {
                label: "Words Left",
                wordCount: 75,
                totalTime: 999,
                endType: "words"
            };
        }
        return {
            label: "Words Left",
            wordCount: 25,
            totalTime: 999,
            endType: "words"
        };
    }

    function shuffleWords(count) {
        const pool = [...WORD_BANK];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        const result = [];
        for (let i = 0; i < count; i++) {
            result.push(pool[i % pool.length]);
        }
        return result.join(" ");
    }

    // --------------------------------------------------------------------------
    // DEBOUNCED STORAGE PERSISTENCE (Zero main-thread disk I/O lag)
    // --------------------------------------------------------------------------
    function schedulePersistSession() {
        if (persistDebounceTimer) clearTimeout(persistDebounceTimer);
        persistDebounceTimer = setTimeout(persistActiveSession, 600);
    }

    function persistActiveSession() {
        let currentElapsed = state.elapsedSeconds;
        if (state.started && state.startTime) {
            currentElapsed += (Date.now() - state.startTime) / 1000;
        }

        const payload = {
            mode: state.mode,
            chars: state.chars,
            currentIndex: state.currentIndex,
            started: state.started,
            finished: state.finished,
            startTime: state.started ? Date.now() : null,
            elapsedSeconds: currentElapsed,
            totalWords: state.totalWords,
            totalTime: state.totalTime,
            timeLeft: state.timeLeft,
            resultSaved: state.resultSaved,
            velocity: state.velocity,
            keyCounts: state.keyCounts,
            sessionId: state.sessionId,
            totalErrors: state.totalErrors,
            totalKeypresses: state.totalKeypresses
        };

        try {
            window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(payload));
        } catch {
            // Private browsing quota safety
        }
    }

    function clearActiveSession() {
        if (persistDebounceTimer) clearTimeout(persistDebounceTimer);
        try {
            window.localStorage.removeItem(ACTIVE_SESSION_KEY);
        } catch {
            // Safety
        }
    }

    function loadActiveSession() {
        try {
            return JSON.parse(window.localStorage.getItem(ACTIVE_SESSION_KEY) || "null");
        } catch {
            return null;
        }
    }

    // --------------------------------------------------------------------------
    // SESSION HISTORY STORAGE & TABLE RENDERING
    // --------------------------------------------------------------------------
    function loadSessions() {
        try {
            return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
        } catch {
            return [];
        }
    }

    function saveSession(result) {
        const sessions = loadSessions();
        const highestNumber = sessions.reduce((max, s) => Math.max(max, s.sessionNumber || 0), 0);
        result.sessionNumber = highestNumber + 1;
        sessions.unshift(result);
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 30)));
        } catch {
            // Storage quota safety
        }
        renderHistoryTable();
    }

    function renderHistoryTable() {
        const sessions = loadSessions();
        if (historyCount) {
            historyCount.textContent = `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`;
        }

        if (!historyTableBody) return;

        if (sessions.length === 0) {
            historyTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="history-empty">No stored sessions yet. Complete your first practice run!</td>
                </tr>
            `;
            return;
        }

        historyTableBody.innerHTML = sessions.map((s, idx) => {
            const dateStr = s.date ? new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Recent";
            const sessionNum = s.sessionNumber || (sessions.length - idx);
            const modeBadge = s.mode === "timed" ? "MEDIUM" : s.mode === "focus" ? "HARD" : "EASY";
            return `
                <tr>
                    <td><strong>#${String(sessionNum).padStart(3, "0")}</strong></td>
                    <td>${dateStr}</td>
                    <td><span class="eyebrow" style="font-size: 0.65rem;">${modeBadge}</span></td>
                    <td><strong style="color: var(--primary); font-size: 1.05rem;">${s.wpm}</strong> WPM</td>
                    <td>${s.accuracy}%</td>
                    <td>${s.errors} err / ${s.durationSeconds}s</td>
                </tr>
            `;
        }).join("");
    }

    // --------------------------------------------------------------------------
    // OPTIMIZED KEYBOARD HEATMAP
    // Caches keycap references: O(1) style updates instead of querying 26 elements
    // --------------------------------------------------------------------------
    function renderKeyboardHeatmap() {
        if (!keyboardHeatmap) return;
        keyboardHeatmap.innerHTML = "";
        keyCapElementsMap.clear();

        KEYBOARD_ROWS.forEach((row, rowIndex) => {
            const rowElement = document.createElement("div");
            rowElement.className = `keyboard-row keyboard-row-${rowIndex + 1}`;
            [...row].forEach((key) => {
                const keyElement = document.createElement("span");
                keyElement.className = "key-cap";
                keyElement.dataset.key = key;
                keyElement.textContent = key;
                rowElement.appendChild(keyElement);
                keyCapElementsMap.set(key, keyElement);
            });
            keyboardHeatmap.appendChild(rowElement);
        });
    }

    function updateKeyboardHeatmap(key) {
        const normalized = key.toUpperCase();
        if (!/^[A-Z]$/.test(normalized)) return;

        state.keyCounts[normalized] = (state.keyCounts[normalized] || 0) + 1;
        const maxCount = Math.max(...Object.values(state.keyCounts), 1);

        // Update active key instantly
        const activeKeyCap = keyCapElementsMap.get(normalized);
        if (activeKeyCap) {
            activeKeyCap.style.setProperty("--heat", String(state.keyCounts[normalized] / maxCount));
        }

        // Periodically refresh relative ratios without blocking input
        requestAnimationFrame(() => {
            keyCapElementsMap.forEach((el, k) => {
                const count = state.keyCounts[k] || 0;
                el.style.setProperty("--heat", String(count / maxCount));
            });
        });

        const hottest = Object.entries(state.keyCounts).sort((a, b) => b[1] - a[1])[0];
        if (hottest && topKey) {
            topKey.textContent = `${hottest[0]} (${hottest[1]})`;
        }
    }

    // --------------------------------------------------------------------------
    // REAL-TIME VELOCITY CHART (SVG Path Generation)
    // --------------------------------------------------------------------------
    function updateVelocityChart() {
        if (!velocityLine || !velocityArea) return;

        const points = state.velocity.slice(-24);
        const width = 640;
        const baseline = 190;
        const usableHeight = 150;
        const maxExpectedWpm = Math.max(...points, 80);

        const coordinates = points.map((value, index) => {
            const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width;
            const y = baseline - Math.min(value / maxExpectedWpm, 1) * usableHeight;
            return [x, y];
        });

        const linePath = coordinates.length
            ? coordinates.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
            : `M0 ${baseline} L${width} ${baseline}`;
        const areaPath = coordinates.length
            ? `${linePath} L${width} ${baseline} L0 ${baseline} Z`
            : `M0 ${baseline} L${width} ${baseline} Z`;

        velocityLine.setAttribute("d", linePath);
        velocityArea.setAttribute("d", areaPath);
        if (livePace) livePace.textContent = `${calculateWpm()} WPM`;
    }

    function updateSessionStatus(label) {
        if (sessionStatus) sessionStatus.textContent = label;
    }

    // --------------------------------------------------------------------------
    // O(1) DOM TEXT RENDERING & CACHING
    // --------------------------------------------------------------------------
    function createSessionText() {
        const config = getConfig();
        state.totalWords = config.wordCount;
        state.totalTime = config.totalTime;
        state.timeLeft = config.totalTime;
        if (timerLabel) timerLabel.textContent = config.label;
        return shuffleWords(config.wordCount);
    }

    function renderChars() {
        if (!textDisplay) return;
        textDisplay.innerHTML = "";
        cachedCharSpans = [];

        const fragment = document.createDocumentFragment();
        state.chars.forEach((charState, index) => {
            const span = document.createElement("span");
            span.className = "char";
            span.dataset.index = String(index);
            span.textContent = charState.expected;
            fragment.appendChild(span);
            cachedCharSpans.push(span);
        });

        textDisplay.appendChild(fragment);

        // Apply initial classes
        state.chars.forEach((charState, index) => {
            if (charState.status === "correct") {
                cachedCharSpans[index].classList.add("correct");
            } else if (charState.status === "incorrect") {
                cachedCharSpans[index].classList.add("incorrect");
            }
        });

        updateCaretPosition(0, state.currentIndex);
    }

    function renderText() {
        const content = createSessionText();
        state.chars = content.split("").map((char) => ({
            expected: char,
            typed: "",
            status: "pending"
        }));
        renderChars();
    }

    // O(1) Caret Movement without re-querying all spans
    function updateCaretPosition(oldIndex, newIndex) {
        if (cachedCharSpans[oldIndex]) {
            cachedCharSpans[oldIndex].classList.remove("current");
        }
        if (cachedCharSpans[newIndex]) {
            cachedCharSpans[newIndex].classList.add("current");
            if (typingPanel) {
                const charRect = cachedCharSpans[newIndex].getBoundingClientRect();
                const panelRect = typingPanel.getBoundingClientRect();
                if (charRect.bottom > panelRect.bottom || charRect.top < panelRect.top) {
                    cachedCharSpans[newIndex].scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
            }
        }
    }

    function paintCharState(index) {
        const span = cachedCharSpans[index];
        if (!span || !state.chars[index]) return;

        span.classList.remove("correct", "incorrect");
        if (state.chars[index].status === "correct") {
            span.classList.add("correct");
        } else if (state.chars[index].status === "incorrect") {
            span.classList.add("incorrect");
        }
    }

    // --------------------------------------------------------------------------
    // METRICS CALCULATIONS (Standard Net WPM & Accuracy)
    // --------------------------------------------------------------------------
    function typedChars() {
        return state.chars.filter((c) => c.typed !== "").length;
    }

    function correctChars() {
        return state.chars.filter((c) => c.status === "correct").length;
    }

    function errorCount() {
        return state.totalErrors;
    }

    function elapsedSeconds() {
        if (state.finished) return state.elapsedSeconds;
        if (!state.started) return 0;
        if (state.startTime) {
            return state.elapsedSeconds + (Date.now() - state.startTime) / 1000;
        }
        return state.elapsedSeconds;
    }

    function countRemainingWords() {
        return state.chars
            .slice(state.currentIndex)
            .map((c) => c.expected)
            .join("")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .length;
    }

    function calculateWpm() {
        const elapsed = elapsedSeconds();
        if (elapsed < 0.8) return 0;
        return Math.max(0, Math.round((correctChars() / 5) / (elapsed / 60)));
    }

    function calculateAccuracy() {
        const total = state.totalKeypresses;
        if (total === 0) return 100;
        return Math.max(0, Math.round(((total - state.totalErrors) / total) * 100));
    }

    function updateProgress() {
        if (!progressFill) return;
        const total = state.chars.length || 1;
        const percent = Math.min((typedChars() / total) * 100, 100);
        progressFill.setAttribute("aria-valuenow", String(Math.round(percent)));
        progressFill.style.width = `${percent}%`;
    }

    function updateStats() {
        const config = getConfig();
        if (timerVal) {
            if (config.endType === "time") {
                timerVal.textContent = String(Math.ceil(Math.max(state.timeLeft, 0))).padStart(2, "0");
            } else {
                timerVal.textContent = String(countRemainingWords());
            }
        }

        const currentWpm = calculateWpm();
        if (wpmVal) wpmVal.textContent = String(currentWpm);
        if (accNumber) accNumber.textContent = String(calculateAccuracy());

        if (!state.velocity.length || state.velocity[state.velocity.length - 1] !== currentWpm) {
            state.velocity.push(currentWpm);
            updateVelocityChart();
        }

        updateProgress();
        schedulePersistSession();
    }

    // --------------------------------------------------------------------------
    // SESSION LIFECYCLE
    // --------------------------------------------------------------------------
    function handleTimerTick() {
        const elapsed = elapsedSeconds();
        state.timeLeft = Math.max(state.totalTime - elapsed, 0);
        updateStats();

        if (state.timeLeft <= 0) {
            finishSession();
        }
    }

    function handleTelemetryTick() {
        if (!state.started || state.finished) return;
        const currentWpm = calculateWpm();
        state.velocity.push(currentWpm);
        updateVelocityChart();
    }

    function startSession() {
        if (state.started && state.startTime) {
            if (getConfig().endType === "time" && !state.timerId) {
                state.timerId = window.setInterval(handleTimerTick, 100);
            }
            if (!state.telemetryTimerId) {
                state.telemetryTimerId = window.setInterval(handleTelemetryTick, 1000);
            }
            return;
        }

        if (!state.started) {
            state.started = true;
            if (focusHint) focusHint.classList.add("hidden");
            updateSessionStatus("Live session");
        }

        state.startTime = Date.now();
        schedulePersistSession();

        if (!state.telemetryTimerId) {
            state.telemetryTimerId = window.setInterval(handleTelemetryTick, 1000);
        }

        if (getConfig().endType === "time") {
            if (state.timerId) window.clearInterval(state.timerId);
            state.timerId = window.setInterval(handleTimerTick, 100);
        }
    }

    function buildResult() {
        return {
            mode: state.mode,
            wpm: calculateWpm(),
            accuracy: calculateAccuracy(),
            errors: errorCount(),
            durationSeconds: Math.max(1, Math.round(elapsedSeconds())),
            characters: typedChars(),
            date: new Date().toISOString()
        };
    }

    function formatModeLabel(mode) {
        if (mode === "timed") return "MEDIUM (30s)";
        if (mode === "focus") return "HARD (75w)";
        return "EASY (25w)";
    }

    function populateResults(result) {
        if (finalWpm) finalWpm.textContent = String(result.wpm);
        if (finalAcc) finalAcc.textContent = `${result.accuracy}%`;
        if (finalErrors) finalErrors.textContent = String(result.errors);
        if (finalMode) finalMode.textContent = formatModeLabel(result.mode);
        if (finalDuration) finalDuration.textContent = `${result.durationSeconds}s`;
        if (finalChars) finalChars.textContent = String(result.characters);
    }

    function finishSession() {
        if (state.finished) return;

        if (state.started && state.startTime) {
            state.elapsedSeconds += (Date.now() - state.startTime) / 1000;
        }
        state.finished = true;
        state.started = false;
        state.startTime = null;
        updateSessionStatus("Session complete");

        if (state.timerId) {
            window.clearInterval(state.timerId);
            state.timerId = null;
        }

        if (state.telemetryTimerId) {
            window.clearInterval(state.telemetryTimerId);
            state.telemetryTimerId = null;
        }

        if (hiddenInput) hiddenInput.blur();
        updateStats();

        const result = buildResult();
        if (!state.resultSaved && typedChars() > 0) {
            saveSession(result);
            state.resultSaved = true;
        }

        populateResults(result);
        if (resultsPanel) {
            resultsPanel.classList.remove("hidden");
            resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        clearActiveSession();
    }

    function resetSession() {
        if (state.timerId) window.clearInterval(state.timerId);
        if (state.telemetryTimerId) window.clearInterval(state.telemetryTimerId);

        state.currentIndex = 0;
        state.timerId = null;
        state.telemetryTimerId = null;
        state.started = false;
        state.finished = false;
        state.startTime = null;
        state.elapsedSeconds = 0;
        state.totalErrors = 0;
        state.totalKeypresses = 0;
        state.resultSaved = false;
        state.velocity = [];
        state.keyCounts = {};
        state.sessionId = String(Math.floor(1000 + Math.random() * 9000));

        if (sessionId) sessionId.textContent = `SESSION ${state.sessionId}`;
        if (topKey) topKey.textContent = "—";
        updateSessionStatus("Ready for input");
        renderKeyboardHeatmap();
        renderHistoryTable();
        updateVelocityChart();

        if (progressFill) {
            progressFill.style.width = "0%";
            progressFill.setAttribute("aria-valuenow", "0");
        }
        if (resultsPanel) resultsPanel.classList.add("hidden");
        if (hiddenInput) hiddenInput.value = "";
        if (focusHint) focusHint.classList.remove("hidden");

        clearActiveSession();
        renderText();
        syncModeButtons();
        updateStats();

        if (hiddenInput) hiddenInput.focus({ preventScroll: true });
    }

    function syncModeButtons() {
        document.querySelectorAll(".mode-btn").forEach((button) => {
            const active = button.dataset.mode === state.mode;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    // --------------------------------------------------------------------------
    // ERGONOMIC INPUT HANDLING (Word Deletion, Single Char, Caret)
    // --------------------------------------------------------------------------
    function handleBackspace() {
        if (state.currentIndex === 0 || state.finished) return;

        const prevIndex = state.currentIndex;
        state.currentIndex -= 1;
        state.chars[state.currentIndex].typed = "";
        state.chars[state.currentIndex].status = "pending";

        paintCharState(state.currentIndex);
        updateCaretPosition(prevIndex, state.currentIndex);
        updateStats();
        playKeyClick(false, false);
    }

    // Ctrl + Backspace or Alt + Backspace: Delete previous word
    function handleWordBackspace() {
        if (state.currentIndex === 0 || state.finished) return;

        const startIndex = state.currentIndex;
        let targetIndex = state.currentIndex - 1;

        // Skip immediate trailing space if on one
        if (state.chars[targetIndex] && state.chars[targetIndex].expected === " ") {
            targetIndex--;
        }

        // Rewind until previous space or start
        while (targetIndex >= 0 && state.chars[targetIndex].expected !== " ") {
            targetIndex--;
        }

        // Target index is now at space, so word starts at targetIndex + 1
        const newIndex = Math.max(0, targetIndex + 1);

        for (let i = newIndex; i <= startIndex; i++) {
            if (state.chars[i]) {
                state.chars[i].typed = "";
                state.chars[i].status = "pending";
                paintCharState(i);
            }
        }

        state.currentIndex = newIndex;
        updateCaretPosition(startIndex, newIndex);
        updateStats();
        playKeyClick(false, false);
    }

    function handleTyping(key) {
        if (state.finished || state.currentIndex >= state.chars.length) return;

        startSession();
        updateKeyboardHeatmap(key);

        const current = state.chars[state.currentIndex];
        const isCorrect = key === current.expected;
        state.totalKeypresses += 1;
        if (!isCorrect) {
            state.totalErrors += 1;
        }

        current.typed = key;
        current.status = isCorrect ? "correct" : "incorrect";

        paintCharState(state.currentIndex);
        const prevIndex = state.currentIndex;
        state.currentIndex += 1;
        updateCaretPosition(prevIndex, state.currentIndex);
        updateStats();

        // Mechanical audio feedback
        playKeyClick(key === " ", !isCorrect);

        if (state.currentIndex >= state.chars.length) {
            if (getConfig().endType === "time") {
                // Dynamically extend words so timed practice continues for the full duration
                const extraContent = " " + shuffleWords(25);
                const startIndex = state.chars.length;
                const extraChars = extraContent.split("").map((c) => ({
                    expected: c,
                    typed: "",
                    status: "pending"
                }));
                state.chars.push(...extraChars);

                if (textDisplay) {
                    const fragment = document.createDocumentFragment();
                    extraChars.forEach((charState, i) => {
                        const span = document.createElement("span");
                        span.className = "char";
                        span.dataset.index = String(startIndex + i);
                        span.textContent = charState.expected;
                        fragment.appendChild(span);
                        cachedCharSpans.push(span);
                    });
                    textDisplay.appendChild(fragment);
                }
                updateCaretPosition(prevIndex, state.currentIndex);
            } else {
                finishSession();
            }
        }
    }

    // --------------------------------------------------------------------------
    // SESSION RESTORATION
    // --------------------------------------------------------------------------
    function restoreSession() {
        const saved = loadActiveSession();
        if (!saved || !Array.isArray(saved.chars) || !saved.chars.length) {
            return false;
        }

        state.mode = saved.mode || "practice";
        state.chars = saved.chars;
        state.currentIndex = Math.min(saved.currentIndex || 0, state.chars.length);
        state.started = Boolean(saved.started);
        state.finished = Boolean(saved.finished);
        state.startTime = saved.startTime || null;
        state.elapsedSeconds = saved.elapsedSeconds || 0;
        state.totalWords = saved.totalWords || 25;
        state.totalTime = saved.totalTime || 30;
        state.timeLeft = saved.timeLeft ?? state.totalTime;
        state.resultSaved = Boolean(saved.resultSaved);
        state.velocity = Array.isArray(saved.velocity) ? saved.velocity : [];
        state.keyCounts = saved.keyCounts && typeof saved.keyCounts === "object" ? saved.keyCounts : {};
        state.sessionId = saved.sessionId || "0001";
        state.totalErrors = saved.totalErrors || 0;
        state.totalKeypresses = saved.totalKeypresses || 0;

        if (state.started && !state.finished) {
            state.startTime = Date.now();
            state.timeLeft = Math.max(state.totalTime - state.elapsedSeconds, 0);

            // Resume active timers on restored session
            if (getConfig().endType === "time" && state.timeLeft > 0) {
                if (state.timerId) window.clearInterval(state.timerId);
                state.timerId = window.setInterval(handleTimerTick, 100);
            }
            if (!state.telemetryTimerId) {
                state.telemetryTimerId = window.setInterval(handleTelemetryTick, 1000);
            }
        }

        if (timerLabel) timerLabel.textContent = getConfig().label;
        if (sessionId) sessionId.textContent = `SESSION ${state.sessionId}`;
        renderHistoryTable();
        updateSessionStatus(state.finished ? "Session complete" : state.started ? "Live session" : "Ready for input");
        renderKeyboardHeatmap();
        renderChars();
        syncModeButtons();
        updateStats();

        if (focusHint) {
            focusHint.classList.toggle("hidden", state.started);
        }

        if (state.finished) {
            const result = buildResult();
            populateResults(result);
            if (resultsPanel) resultsPanel.classList.remove("hidden");
        } else if (hiddenInput) {
            hiddenInput.focus({ preventScroll: true });
        }

        return true;
    }

    // --------------------------------------------------------------------------
    // SMART FOCUS & KEYBOARD EVENT ROUTER (NO FOCUS TRAP!)
    // --------------------------------------------------------------------------
    function handleKeydown(event) {
        // Global reset shortcut takes precedence even if focus is on buttons
        if (event.key === "Escape") {
            event.preventDefault();
            resetSession();
            return;
        }

        // Allow normal modifier combinations except word backspace (Ctrl, Alt, or Cmd + Backspace)
        if ((event.ctrlKey || event.altKey || event.metaKey) && event.key === "Backspace") {
            event.preventDefault();
            handleWordBackspace();
            return;
        }

        if (event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }

        const active = document.activeElement;
        const isInteractive = active && (active.tagName === "INPUT" && active !== hiddenInput || active.tagName === "TEXTAREA" || active.tagName === "BUTTON" || active.tagName === "A");

        if (isInteractive) return;

        if (event.key === "Backspace") {
            event.preventDefault();
            handleBackspace();
            return;
        }

        if (event.key.length === 1) {
            event.preventDefault();
            if (hiddenInput && active !== hiddenInput) {
                hiddenInput.focus({ preventScroll: true });
            }
            handleTyping(event.key);
        }
    }

    // --------------------------------------------------------------------------
    // EVENT BINDINGS
    // --------------------------------------------------------------------------
    function attachEvents() {
        // Mode Buttons
        document.querySelectorAll(".mode-btn").forEach((button) => {
            button.addEventListener("click", () => {
                state.mode = button.dataset.mode;
                resetSession();
            });
        });

        // Restart buttons
        if (restartBtn) restartBtn.addEventListener("click", resetSession);
        if (resultRestartBtn) resultRestartBtn.addEventListener("click", resetSession);

        // Clear History
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener("click", () => {
                if (confirm("Are you sure you want to clear your local practice history?")) {
                    try {
                        window.localStorage.removeItem(STORAGE_KEY);
                    } catch {
                        // Safety
                    }
                    renderHistoryTable();
                }
            });
        }

        // Focus canvas on click (NON-INTRUSIVE: NO BLUR TRAP!)
        if (typingPanel) {
            typingPanel.addEventListener("click", () => {
                if (hiddenInput) hiddenInput.focus({ preventScroll: true });
            });
        }

        // Global key router
        document.addEventListener("keydown", handleKeydown);

        // Mobile virtual keyboard compatibility (Android / iOS IME)
        if (hiddenInput) {
            hiddenInput.addEventListener("beforeinput", (e) => {
                if (e.inputType === "deleteContentBackward") {
                    e.preventDefault();
                    handleBackspace();
                }
            });

            hiddenInput.addEventListener("input", (e) => {
                if (e.inputType === "deleteContentBackward") {
                    handleBackspace();
                    return;
                }
                const val = hiddenInput.value;
                hiddenInput.value = "";
                [...val].forEach((char) => {
                    if (char.length === 1) handleTyping(char);
                });
            });
        }
    }

    // --------------------------------------------------------------------------
    // BOOTSTRAP
    // --------------------------------------------------------------------------
    attachEvents();
    renderKeyboardHeatmap();
    renderHistoryTable();

    if (!restoreSession()) {
        resetSession();
    }
})();
