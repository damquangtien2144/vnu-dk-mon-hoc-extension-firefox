// State mặc định
const DEFAULT_LABELS = [
    { id: 'name', title: "Tên môn học" },
    { id: 'code', title: "Mã lớp học phần" },
    { id: 'day', title: "Thứ" },
    { id: 'shift', title: "Ca" },
    { id: 'room', title: "Giảng đường" }
];

const DEFAULT_HIGHLIGHT_SETTINGS = {
    style: 'background',
    opacity: 100
};

let labels = JSON.parse(JSON.stringify(DEFAULT_LABELS));
let highlightSettings = { ...DEFAULT_HIGHLIGHT_SETTINGS };
let subjects = [];
let isIframeMode = window.location.search.includes('mode=iframe');
let isPinned = false;
let currentLang = 'vi';
let translations = {};
let currentStreak = 1;
let lastActiveDate = null;

// Lưu trữ match count cho mỗi subject (key: subjectId)
const matchCounts = {};

// DOM Elements
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const btnSettings = document.getElementById('btnSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const btnResetSettings = document.getElementById('btnResetSettings');

const subjectList = document.getElementById('subjectList');
const btnAdd = document.getElementById('btnAdd');
const btnClearAll = document.getElementById('btnClearAll');
const btnImportCsv = document.getElementById('btnImportCsv');
const csvFileInput = document.getElementById('csvFileInput');
const btnDownloadTemplate = document.getElementById('btnDownloadTemplate');
const btnScanAll = document.getElementById('btnScanAll');

// Khởi tạo
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    await loadTranslations();
    updateStreak();
    renderLabels();
    renderSubjects();
    initHighlightSettingsUI();
    initExtraFeatures();
    checkOnboarding();
});

// Load dữ liệu từ storage
async function loadData() {
    const result = await chrome.storage.local.get(['subjects', 'labels', 'isPinned', 'highlightSettings', 'onboardingDone', 'lang', 'currentStreak', 'lastActiveDate']);
    
    if (result.lang) currentLang = result.lang;
    if (result.currentStreak) currentStreak = result.currentStreak;
    if (result.lastActiveDate) lastActiveDate = result.lastActiveDate;
    if (result.labels) {
        if (Array.isArray(result.labels)) {
            labels = result.labels;
        } else {
            labels = [
                { id: 'name', title: result.labels.name || "Tên môn học" },
                { id: 'code', title: result.labels.code || "Mã lớp học phần" },
                { id: 'day', title: result.labels.day || "Thứ" },
                { id: 'shift', title: result.labels.shift || "Ca" },
                { id: 'room', title: result.labels.room || "Giảng đường" }
            ];
        }
    }

    if (result.subjects) {
        subjects = result.subjects.map(s => {
            if (s.fields) return s;
            return {
                id: s.id,
                color: s.color,
                isActive: s.isActive,
                isBlinking: s.isBlinking,
                tag: s.tag || '',
                fields: {
                    name: s.name || '',
                    code: s.code || '',
                    day: s.day || '',
                    shift: s.shift || '',
                    room: s.room || ''
                }
            };
        });
    } else {
        subjects = [{ id: Date.now(), color: '#ffff00', isActive: true, tag: '', fields: {} }];
    }
    
    if (result.isPinned) isPinned = result.isPinned;
    if (result.highlightSettings) highlightSettings = result.highlightSettings;
}

// Lưu dữ liệu vào storage
function saveData() {
    chrome.storage.local.set({ subjects, labels, highlightSettings, lang: currentLang, currentStreak, lastActiveDate });
}

// Cập nhật placeholder dựa trên labels
function renderLabels() {
    const container = document.getElementById('customLabelsContainer');
    if (container) {
        container.innerHTML = '';
        labels.forEach((label, index) => {
            const div = document.createElement('div');
            div.className = 'form-group';
            div.style.marginBottom = '10px';
            div.innerHTML = `
                <input type="text" class="label-title-input" data-index="${index}" value="${label.title}" placeholder="Tên trường tìm kiếm" style="flex: 1; margin-right: 8px;">
                ${labels.length > 1 ? `<button class="btn btn-icon btn-delete-label" data-index="${index}" title="Xóa trường này" style="color: var(--danger-color); border-color: rgba(244, 63, 94, 0.3);">❌</button>` : ''}
            `;
            container.appendChild(div);
        });
    }

    // Tính toán lại biến grid-columns CSS
    document.documentElement.style.setProperty('--grid-columns', `repeat(${labels.length}, minmax(50px, 1fr)) 40px`);
    
    // Cập nhật Header màn hình chính
    const headerContainer = document.getElementById('inputsGridHeader');
    if (headerContainer) {
        headerContainer.innerHTML = '';
        labels.forEach(label => {
            const div = document.createElement('div');
            div.textContent = label.title;
            headerContainer.appendChild(div);
        });
        const colorDiv = document.createElement('div');
        colorDiv.textContent = 'Màu';
        headerContainer.appendChild(colorDiv);
    }
}

// ======= Feature #6: Cập nhật match counter cho 1 row =======
function updateMatchCounter(subjectId, current, total) {
    matchCounts[subjectId] = { current, total };
    const rows = subjectList.querySelectorAll('.subject-row');
    rows.forEach((row, idx) => {
        if (subjects[idx] && subjects[idx].id === subjectId) {
            const counter = row.querySelector('.match-counter');
            if (counter) {
                if (total > 0) {
                    counter.textContent = `${current + 1}/${total}`;
                    counter.style.display = 'inline-flex';
                    counter.classList.remove('no-results');
                } else {
                    counter.textContent = '0';
                    counter.style.display = 'inline-flex';
                    counter.classList.add('no-results');
                }
            }
        }
    });
}

// ======= Feature #8: Drag & Drop Logic =======
let dragSrcIndex = null;

function initDragAndDrop(row, index) {
    const handle = row.querySelector('.drag-handle');
    
    // Chỉ cho phép drag khi bắt đầu từ handle
    handle.addEventListener('mousedown', () => {
        row.setAttribute('draggable', 'true');
    });
    
    row.addEventListener('dragstart', (e) => {
        dragSrcIndex = index;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
    });

    row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        row.setAttribute('draggable', 'false');
        // Xóa tất cả drag-over state
        subjectList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // Chỉ highlight nếu khác row đang drag
        if (dragSrcIndex !== index) {
            row.classList.add('drag-over');
        }
    });

    row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
    });

    row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        
        const fromIndex = dragSrcIndex;
        const toIndex = index;
        
        if (fromIndex !== null && fromIndex !== toIndex) {
            // Swap trong mảng subjects
            const [moved] = subjects.splice(fromIndex, 1);
            subjects.splice(toIndex, 0, moved);
            saveData();
            renderSubjects();
        }
        dragSrcIndex = null;
    });
}

// Render danh sách môn học
function renderSubjects() {
    subjectList.innerHTML = '';
    const template = document.getElementById('subjectRowTemplate');

    subjects.forEach((subject, index) => {
        const clone = template.content.cloneNode(true);
        const row = clone.querySelector('.subject-row');
        row.setAttribute('draggable', 'false'); // Mặc định không drag
        
        const inputsGrid = row.querySelector('.inputs-grid');
        inputsGrid.innerHTML = ''; // Xóa hết
        
        // Render dynamic inputs
        labels.forEach(label => {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'dynamic-input';
            input.dataset.fieldId = label.id;
            input.placeholder = label.title;
            input.value = subject.fields[label.id] || '';
            input.style.width = '100%';
            input.style.padding = '9px 12px';
            input.style.backgroundColor = 'var(--bg-sunken)';
            input.style.border = '1.5px solid var(--border-subtle)';
            input.style.borderRadius = 'var(--radius-sm)';
            input.style.fontSize = '13px';
            input.style.fontFamily = "'Inter', sans-serif";
            input.style.color = 'var(--text-primary)';
            input.style.outline = 'none';
            
            input.addEventListener('focus', () => {
                input.style.borderColor = 'var(--primary-color)';
                input.style.backgroundColor = '#ffffff';
                input.style.boxShadow = '0 0 0 3.5px rgba(99, 102, 241, 0.1)';
            });
            input.addEventListener('blur', () => {
                input.style.borderColor = 'var(--border-subtle)';
                input.style.backgroundColor = 'var(--bg-sunken)';
                input.style.boxShadow = 'none';
            });
            
            input.addEventListener('input', (e) => {
                subject.fields[label.id] = e.target.value;
                saveData();
                if (e.target.value.trim() === '') {
                    performSearch(subject);
                }
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    row.querySelector('.btn-search').click();
                }
            });
            
            inputsGrid.appendChild(input);
        });
        
        // Color input
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'input-color';
        colorInput.value = subject.color || '#ffff00';
        colorInput.title = 'Màu bôi đen';
        colorInput.addEventListener('input', (e) => {
            subject.color = e.target.value;
            saveData();
            performSearch(subject);
        });
        inputsGrid.appendChild(colorInput);

        // ======= Feature: Toggle Active =======
        const toggleActive = row.querySelector('.toggle-active');
        const isActive = subject.isActive !== false; // Mặc định là true
        toggleActive.checked = isActive;
        if (!isActive) {
            row.classList.add('disabled');
        }

        toggleActive.addEventListener('change', (e) => {
            subject.isActive = e.target.checked;
            if (subject.isActive) {
                row.classList.remove('disabled');
                performSearch(subject);
            } else {
                row.classList.add('disabled');
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "HIGHLIGHT",
                            subjectId: subject.id,
                            queries: [],
                            color: subject.color,
                            highlightSettings: highlightSettings
                        }).catch(e => console.error(e));
                    }
                });
                updateMatchCounter(subject.id, 0, 0);
            }
            saveData();
        });

        // Feature #13: Tag Selection
        const tagSelect = row.querySelector('.tag-select');
        if (tagSelect) {
            tagSelect.value = subject.tag || '';
            tagSelect.className = 'tag-select' + (subject.tag ? ` tag-${subject.tag}` : '');
            tagSelect.addEventListener('change', (e) => {
                subject.tag = e.target.value;
                tagSelect.className = 'tag-select' + (subject.tag ? ` tag-${subject.tag}` : '');
                saveData();
            });
        }

        // Feature #3: Duplicate
        const btnDuplicate = row.querySelector('.btn-duplicate');
        if (btnDuplicate) {
            btnDuplicate.addEventListener('click', () => {
                const newSubject = JSON.parse(JSON.stringify(subject));
                newSubject.id = Date.now();
                subjects.splice(index + 1, 0, newSubject);
                saveData();
                renderSubjects();
            });
        }

        // Khôi phục match counter nếu có
        const counter = row.querySelector('.match-counter');
        if (matchCounts[subject.id] && matchCounts[subject.id].total > 0) {
            const mc = matchCounts[subject.id];
            counter.textContent = `${mc.current + 1}/${mc.total}`;
            counter.style.display = 'inline-flex';
        }

        // Nút Xóa
        const btnDelete = row.querySelector('.btn-delete');
        btnDelete.addEventListener('click', async () => {
            subjects.splice(index, 1);
            delete matchCounts[subject.id];
            saveData();
            
            // Xóa highlight của subject này trên trang khi bị xóa khỏi danh sách
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "HIGHLIGHT",
                        subjectId: subject.id,
                        queries: [],
                        color: subject.color,
                        highlightSettings: highlightSettings
                    }).catch(e => console.error(e));
                }
            } catch (err) { console.error(err); }
            
            renderSubjects();
        });

        // Nút Tìm kiếm
        const btnSearch = row.querySelector('.btn-search');
        btnSearch.addEventListener('click', () => {
            performSearch(subject);
        });

        // Nút Nhấp nháy (Star)
        const btnStar = row.querySelector('.btn-star');
        if (btnStar) {
            btnStar.textContent = subject.isBlinking ? '⭐' : '☆';
            btnStar.addEventListener('click', async () => {
                subject.isBlinking = !subject.isBlinking;
                btnStar.textContent = subject.isBlinking ? '⭐' : '☆';
                saveData();
                try {
                    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "BLINK_HIGHLIGHT",
                            subjectId: subject.id,
                            isBlinking: subject.isBlinking
                        }).catch(e => console.error(e));
                    }
                } catch (err) { console.error(err); }
            });
        }

        // Điều hướng (Next/Prev)
        const btnPrev = row.querySelector('.btn-prev');
        const btnNext = row.querySelector('.btn-next');
        
        btnPrev.addEventListener('click', () => {
            performNavigation(subject.id, 'prev');
        });
        
        btnNext.addEventListener('click', () => {
            performNavigation(subject.id, 'next');
        });

        // Feature #8: Init Drag & Drop
        initDragAndDrop(row, index);

        subjectList.appendChild(clone);
    });

    // Update master toggle state
    const toggleAll = document.getElementById('toggleAll');
    if (toggleAll) {
        const allDisabled = subjects.length > 0 && subjects.every(s => s.isActive === false);
        toggleAll.checked = !allDisabled;
    }
}

// Thêm môn học
const highlightColors = ['#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ff8800', '#ff0088', '#8800ff'];
btnAdd.addEventListener('click', () => {
    const nextColor = highlightColors[subjects.length % highlightColors.length];
    subjects.push({
        id: Date.now(),
        fields: {},
        color: nextColor,
        isActive: true
    });
    saveData();
    renderSubjects();
    
    // Scroll to bottom
    setTimeout(() => {
        subjectList.scrollTop = subjectList.scrollHeight;
    }, 50);
});

// Xóa tất cả
btnClearAll.addEventListener('click', async () => {
    if (confirm("Bạn chắc chưa? Hành động này sẽ xóa tất cả các môn học trong danh sách.")) {
        subjects = [];
        Object.keys(matchCounts).forEach(k => delete matchCounts[k]);
        saveData();
        
        // Xóa sạch highlight trên trang
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "HIGHLIGHT_ALL", subjects: [] }).catch(e => console.error(e));
            }
        } catch(err) { console.error(err); }

        renderSubjects();
    }
});

// Master Toggle All logic
const toggleAll = document.getElementById('toggleAll');
if (toggleAll) {
    toggleAll.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        subjects.forEach(subject => {
            subject.isActive = isChecked;
        });
        saveData();
        renderSubjects();
        
        if (isChecked) {
            btnScanAll.click(); // Tự động quét lại
        } else {
            // Xóa tất cả highlight
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: "HIGHLIGHT_ALL", subjects: [] }).catch(e => console.error(e));
                }
            });
            Object.keys(matchCounts).forEach(id => updateMatchCounter(parseInt(id), 0, 0));
        }
    });
}

// Chuyển đổi view Cài đặt
btnSettings.addEventListener('click', () => {
    mainView.classList.remove('active');
    settingsView.classList.add('active');
});

btnCloseSettings.addEventListener('click', () => {
    settingsView.classList.remove('active');
    mainView.classList.add('active');
});

// Lưu cài đặt
btnSaveSettings.addEventListener('click', () => {
    const inputs = document.querySelectorAll('.label-title-input');
    const newLabels = [];
    inputs.forEach((input, idx) => {
        const oldLabel = labels[idx];
        newLabels.push({
            id: oldLabel ? oldLabel.id : 'custom_' + Date.now() + '_' + idx,
            title: input.value.trim() || 'Trường mới'
        });
    });
    labels = newLabels;
    
    // Feature #14: Lưu highlight settings
    highlightSettings.style = document.getElementById('highlightStyle').value;
    highlightSettings.opacity = parseInt(document.getElementById('highlightOpacity').value);
    
    saveData();
    renderLabels();
    renderSubjects();
    alert("Đã lưu cài đặt!");
    btnCloseSettings.click();
});

// Khôi phục cài đặt gốc
btnResetSettings.addEventListener('click', () => {
    if (confirm("Bạn chắc chưa? Các nhãn và cài đặt highlight sẽ được khôi phục về mặc định.")) {
        labels = JSON.parse(JSON.stringify(DEFAULT_LABELS));
        highlightSettings = { ...DEFAULT_HIGHLIGHT_SETTINGS };
        renderLabels();
        initHighlightSettingsUI();
        renderSubjects();
        saveData();
    }
});

// Thêm nhãn mới
const btnAddLabel = document.getElementById('btnAddLabel');
if (btnAddLabel) {
    btnAddLabel.addEventListener('click', () => {
        labels.push({ id: 'custom_' + Date.now(), title: 'Trường mới' });
        renderLabels();
    });
}

// Xóa nhãn
const customLabelsContainer = document.getElementById('customLabelsContainer');
if (customLabelsContainer) {
    customLabelsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-delete-label');
        if (btn) {
            const index = parseInt(btn.dataset.index);
            labels.splice(index, 1);
            renderLabels();
        }
    });
}

// --- Chức năng CSV ---
btnDownloadTemplate.addEventListener('click', () => {
    const headerRow = labels.map(l => `"${l.title}"`).join(',') + ',"Màu Highlight"';
    const sampleRow = labels.map(l => `""`).join(',');
    const csvContent = `${headerRow}\n${sampleRow},"#FFFF00"`;
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_dang_ky_mon_hoc.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

btnImportCsv.addEventListener('click', () => {
    csvFileInput.click();
});

csvFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const text = event.target.result;
        parseCSV(text);
        csvFileInput.value = ''; // Reset
    };
    reader.readAsText(file);
});

function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    if (lines.length <= 1) {
        alert("File CSV không có dữ liệu hợp lệ!");
        return;
    }

    for (let i = 1; i < lines.length; i++) {
        const matches = lines[i].match(/(\".*?\"|[^\",\s]+)(?=\s*,|\s*$)/g);
        if (!matches) continue;
        
        const row = matches.map(m => m.replace(/^"|"$/g, '').trim());
        const subject = {
            id: Date.now() + i,
            fields: {},
            isActive: true
        };
        
        labels.forEach((label, idx) => {
            subject.fields[label.id] = row[idx] || '';
        });
        subject.color = row[labels.length] || '#ffff00';
        
        subjects.push(subject);
    }

    saveData();
    renderSubjects();
    alert("Đã tải dữ liệu thành công!");
}


// --- Logic Gửi lệnh Tìm kiếm (Feature #6: nhận response cập nhật counter) ---
async function performSearch(subject) {
    if (subject.isActive === false) return; // Không tìm nếu đang tắt
    
    const queries = labels.flatMap(l => {
        const val = subject.fields[l.id];
        if (!val || val.trim().length === 0) return [];
        return val.split(',').map(v => v.trim()).filter(v => v.length > 0);
    });
        
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scripts/content.js'] });
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: "HIGHLIGHT",
            subjectId: subject.id,
            queries: queries,
            color: subject.color,
            isBlinking: subject.isBlinking,
            highlightSettings: highlightSettings
        });
        if (response && response.success) {
            updateMatchCounter(subject.id, response.currentIndex || 0, response.count || 0);
        }
    } catch (err) {
        console.error(err);
    }
}

// Logic Nút Quét tất cả
btnScanAll.addEventListener('click', async () => {
    if (subjects.length === 0) {
        alert("Danh sách môn học đang trống.");
        return;
    }

    const payload = subjects.filter(s => s.isActive !== false).map(s => {
        return {
            subjectId: s.id,
            color: s.color,
            isBlinking: s.isBlinking,
            queries: labels.flatMap(l => {
                const val = s.fields[l.id];
                if (!val || val.trim().length === 0) return [];
                return val.split(',').map(v => v.trim()).filter(v => v.length > 0);
            })
        };
    }).filter(s => s.queries.length > 0);

    if (payload.length === 0) {
        alert("Các môn học chưa có thông tin hợp lệ để quét.");
        return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scripts/content.js'] });
        chrome.tabs.sendMessage(tab.id, {
            action: "HIGHLIGHT_ALL",
            subjects: payload,
            highlightSettings: highlightSettings
        }, (response) => {
            if (chrome.runtime.lastError) return;
            if (response && response.success && response.counts) {
                // Cập nhật counter cho từng subject
                for (const [sid, count] of Object.entries(response.counts)) {
                    updateMatchCounter(parseInt(sid) || sid, 0, count);
                }
            }
        });
    } catch (err) {
        console.error(err);
        alert("Không thể quét trên trang này.");
    }
});

// Logic Điều hướng (Feature #6: nhận response cập nhật counter)
async function performNavigation(subjectId, direction) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scripts/content.js'] });
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: "NAVIGATE",
            subjectId: subjectId,
            direction: direction
        });
        if (response && response.success) {
            updateMatchCounter(subjectId, response.currentIndex || 0, response.totalCount || 0);
        }
    } catch (err) {
        console.error(err);
    }
}

// --- Logic Floating Panel (Cửa sổ nổi) & Drag ---
const btnTogglePin = document.getElementById('btnTogglePin');

if (isIframeMode) {
    updatePinButton();

    btnTogglePin.addEventListener('click', () => {
        isPinned = !isPinned;
        chrome.storage.local.set({ isPinned });
        updatePinButton();
        
        // Báo cho parent window biết trạng thái ghim
        window.parent.postMessage({ action: 'PIN_STATE', isPinned }, '*');
    });

    // --- Draggable Logic (chỉ áp dụng khi ở mode iframe) ---
    const header = document.querySelector('.header');
    header.classList.add('draggable');

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.header-actions')) return;
        
        document.body.classList.add('is-dragging');
        
        window.parent.postMessage({
            action: 'DRAG_START',
            iframeX: e.clientX,
            iframeY: e.clientY
        }, '*');
    });

    window.addEventListener('message', (event) => {
        if (event.data && event.data.action === 'DRAG_END') {
            document.body.classList.remove('is-dragging');
        }
    });

} else {
    // Nếu là popup gốc
    btnTogglePin.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scripts/content.js'] });
            await chrome.tabs.sendMessage(tab.id, { action: "INJECT_PANEL" });
            window.close(); // Đóng popup gốc
        } catch (err) {
            console.error(err);
            // Hiển thị lỗi ngay trên popup thay vì dùng alert (alert làm popup bị tắt luôn)
            const btn = document.getElementById('btnTogglePin');
            const originalText = btn.innerHTML;
            btn.innerHTML = '❌ Lỗi: Không thể nổi ở trang này';
            btn.style.color = 'red';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.color = '';
            }, 3000);
        }
    });
}

// Meme Toggle
const btnToggleMeme = document.getElementById('btnToggleMeme');
const memeContainer = document.getElementById('memeContainer');
const memeContainerLeft = document.getElementById('memeContainerLeft');
const memeContainerCenter = document.getElementById('memeContainerCenter');

let isMemeActive = false;
if (btnToggleMeme) {
    btnToggleMeme.addEventListener('click', () => {
        isMemeActive = !isMemeActive;
        if (isMemeActive) {
            if (memeContainer) memeContainer.style.display = 'block';
            if (memeContainerLeft) memeContainerLeft.style.display = 'block';
            if (memeContainerCenter) memeContainerCenter.style.display = 'block';
            btnToggleMeme.classList.add('pinned');
        } else {
            if (memeContainer) memeContainer.style.display = 'none';
            if (memeContainerLeft) memeContainerLeft.style.display = 'none';
            if (memeContainerCenter) memeContainerCenter.style.display = 'none';
            btnToggleMeme.classList.remove('pinned');
        }
    });
}

function updatePinButton() {
    if (isPinned) {
        btnTogglePin.innerHTML = '📌 <span class="pin-text">Đã ghim</span>';
        btnTogglePin.classList.add('pinned');
    } else {
        btnTogglePin.innerHTML = '📌 <span class="pin-text">Ghim</span>';
        btnTogglePin.classList.remove('pinned');
    }
}

// --- Logic Modal Donate ---
const btnShowDonate = document.getElementById('btnShowDonate');
const donateModal = document.getElementById('donateModal');
const btnCloseDonate = document.getElementById('btnCloseDonate');

if (btnShowDonate) {
    btnShowDonate.addEventListener('click', () => {
        donateModal.classList.add('active');
    });
}

function closeDonateModal() {
    donateModal.classList.remove('active');
}

if (btnCloseDonate) {
    btnCloseDonate.addEventListener('click', closeDonateModal);
}

// Đóng modal khi click ra ngoài
window.addEventListener('click', (e) => {
    if (e.target === donateModal) {
        closeDonateModal();
    }
});

// ======= Feature #7: Phím tắt toàn cục =======
document.addEventListener('keydown', (e) => {
    // Onboarding keyboard navigation
    const onboardingOverlay = document.getElementById('onboardingOverlay');
    if (onboardingOverlay && onboardingOverlay.style.display !== 'none' && onboardingOverlay.style.display !== '') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            document.getElementById('btnOnboardingNext')?.click();
            return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            document.getElementById('btnOnboardingPrev')?.click();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            finishOnboarding();
            return;
        }
        return; // Block other shortcuts while onboarding is open
    }

    // Ctrl+Shift+S → Quét tất cả
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        btnScanAll.click();
        return;
    }
    // Ctrl+Shift+A → Thêm môn học
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        btnAdd.click();
        return;
    }
    // Escape → Đóng modal/settings
    if (e.key === 'Escape') {
        if (donateModal.classList.contains('active')) {
            closeDonateModal();
        } else if (settingsView.classList.contains('active')) {
            btnCloseSettings.click();
        }
        return;
    }
});

// ======= Feature #14: Highlight Settings UI =======
function initHighlightSettingsUI() {
    const styleSelect = document.getElementById('highlightStyle');
    const opacitySlider = document.getElementById('highlightOpacity');
    const opacityValue = document.getElementById('opacityValue');
    const previewText = document.getElementById('previewText');

    if (!styleSelect || !opacitySlider) return;

    // Set current values
    styleSelect.value = highlightSettings.style;
    opacitySlider.value = highlightSettings.opacity;
    opacityValue.textContent = highlightSettings.opacity + '%';

    // Update preview
    function updatePreview() {
        const style = styleSelect.value;
        const opacity = opacitySlider.value / 100;
        const color = '#ffff00'; // Sample color

        // Reset styles
        previewText.style.cssText = '';
        
        switch (style) {
            case 'background':
                previewText.style.backgroundColor = color;
                previewText.style.opacity = opacity;
                previewText.style.padding = '4px 12px';
                previewText.style.borderRadius = '4px';
                previewText.style.color = '#000';
                break;
            case 'underline':
                previewText.style.textDecoration = `wavy underline ${color}`;
                previewText.style.textDecorationThickness = '3px';
                previewText.style.textUnderlineOffset = '4px';
                previewText.style.opacity = opacity;
                break;
            case 'border':
                previewText.style.borderBottom = `3px solid ${color}`;
                previewText.style.paddingBottom = '2px';
                previewText.style.opacity = opacity;
                break;
            case 'bold':
                previewText.style.fontWeight = 'bold';
                previewText.style.color = color;
                previewText.style.opacity = opacity;
                previewText.style.textShadow = `0 0 8px ${color}`;
                break;
        }
    }

    styleSelect.addEventListener('change', updatePreview);
    opacitySlider.addEventListener('input', () => {
        opacityValue.textContent = opacitySlider.value + '%';
        updatePreview();
    });

    updatePreview();
}

// ======= Feature #15: Onboarding Tour (Full-Screen Slides) =======
const ONBOARDING_STEPS = [
    { icon: '🎉', titleKey: 'onboarding_step1_title', descKey: 'onboarding_step1_desc' },
    { icon: '✏️', titleKey: 'onboarding_step2_title', descKey: 'onboarding_step2_desc' },
    { icon: '🔍', titleKey: 'onboarding_step3_title', descKey: 'onboarding_step3_desc' },
    { icon: '⚡', titleKey: 'onboarding_step4_title', descKey: 'onboarding_step4_desc' },
    { icon: '🔄', titleKey: 'onboarding_step5_title', descKey: 'onboarding_step5_desc' },
    { icon: '📁', titleKey: 'onboarding_step6_title', descKey: 'onboarding_step6_desc' },
    { icon: '📌', titleKey: 'onboarding_step7_title', descKey: 'onboarding_step7_desc' },
    { icon: '⚙️', titleKey: 'onboarding_step8_title', descKey: 'onboarding_step8_desc' },
    { icon: '⌨️', titleKey: 'onboarding_step9_title', descKey: 'onboarding_step9_desc' },
    { icon: '🚀', titleKey: 'onboarding_step10_title', descKey: 'onboarding_step10_desc' }
];

let currentOnboardingStep = 0;
let onboardingDirection = 'right'; // 'right' or 'left' for slide animation

function checkOnboarding() {
    chrome.storage.local.get(['onboardingDone'], (result) => {
        if (!result.onboardingDone) {
            setTimeout(() => startOnboarding(), 500);
        }
    });
}

function startOnboarding() {
    currentOnboardingStep = 0;
    onboardingDirection = 'right';
    showOnboardingStep();
}

function renderOnboardingDesc(rawText) {
    // Split by newlines, detect bullet lines (starting with •) and intro lines
    const lines = rawText.split('\n');
    let html = '';
    let hasBullets = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            html += '<br>';
            continue;
        }
        if (trimmed.startsWith('•')) {
            hasBullets = true;
            const content = trimmed.substring(1).trim();
            // Wrap keyboard shortcuts in <kbd> tags
            const formatted = content.replace(
                /(Ctrl\s*\+\s*Shift\s*\+\s*\w|Ctrl\s*\+\s*[↑↓]|Enter|ESC|Escape)/g,
                '<span class="onboarding-kbd">$1</span>'
            );
            html += `<div class="ob-bullet"><span class="ob-bullet-dot">•</span><span>${formatted}</span></div>`;
        } else {
            // Check if this is the last step (final message)
            if (!hasBullets && lines.length <= 3) {
                html += `<div class="ob-final">${trimmed}</div>`;
            } else {
                html += `<div class="ob-intro">${trimmed}</div>`;
            }
        }
    }
    return html;
}

function showOnboardingStep() {
    const overlay = document.getElementById('onboardingOverlay');
    const slide = document.getElementById('onboardingSlide');
    const iconEl = document.getElementById('onboardingIcon');
    const titleEl = document.getElementById('onboardingTitle');
    const descEl = document.getElementById('onboardingDesc');
    const progressBar = document.getElementById('onboardingProgressBar');
    const stepCounter = document.getElementById('onboardingStepCounter');
    const dotsContainer = document.getElementById('onboardingDots');
    const prevBtn = document.getElementById('btnOnboardingPrev');
    const nextBtn = document.getElementById('btnOnboardingNext');
    const skipBtn = document.getElementById('btnOnboardingSkip');

    if (currentOnboardingStep >= ONBOARDING_STEPS.length) {
        finishOnboarding();
        return;
    }

    const step = ONBOARDING_STEPS[currentOnboardingStep];
    const totalSteps = ONBOARDING_STEPS.length;

    // Show overlay
    overlay.style.display = 'flex';

    // Progress bar
    const progress = ((currentOnboardingStep + 1) / totalSteps) * 100;
    progressBar.style.width = progress + '%';

    // Step counter
    const stepOfTemplate = t('onboarding_step_of') || 'Bước {current} / {total}';
    stepCounter.textContent = stepOfTemplate
        .replace('{current}', currentOnboardingStep + 1)
        .replace('{total}', totalSteps);

    // Slide animation
    slide.classList.remove('slide-in-right', 'slide-in-left');
    // Force reflow to retrigger animation
    void slide.offsetWidth;
    slide.classList.add(onboardingDirection === 'right' ? 'slide-in-right' : 'slide-in-left');

    // Icon with pop animation
    iconEl.textContent = step.icon;
    iconEl.style.animation = 'none';
    void iconEl.offsetWidth;
    iconEl.style.animation = '';

    // Title & Description
    titleEl.textContent = t(step.titleKey) || step.titleKey;
    const rawDesc = t(step.descKey) || step.descKey;
    descEl.innerHTML = renderOnboardingDesc(rawDesc);

    // Dots
    dotsContainer.innerHTML = ONBOARDING_STEPS.map((_, i) =>
        `<span class="onboarding-dot ${i === currentOnboardingStep ? 'active' : ''}" data-step="${i}"></span>`
    ).join('');

    // Add click listeners to dots
    dotsContainer.querySelectorAll('.onboarding-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const targetStep = parseInt(dot.dataset.step);
            if (targetStep !== currentOnboardingStep) {
                onboardingDirection = targetStep > currentOnboardingStep ? 'right' : 'left';
                currentOnboardingStep = targetStep;
                showOnboardingStep();
            }
        });
    });

    // Prev button visibility
    if (currentOnboardingStep > 0) {
        prevBtn.style.display = 'inline-flex';
        prevBtn.textContent = t('onboarding_prev') || '← Quay lại';
    } else {
        prevBtn.style.display = 'none';
    }

    // Next button text
    if (currentOnboardingStep === totalSteps - 1) {
        nextBtn.textContent = t('onboarding_done') || '🚀 Bắt đầu sử dụng';
        nextBtn.style.minWidth = '170px';
        skipBtn.style.display = 'none';
    } else {
        nextBtn.textContent = t('onboarding_next') || 'Tiếp theo →';
        nextBtn.style.minWidth = '130px';
        skipBtn.style.display = 'inline-flex';
        skipBtn.textContent = t('onboarding_skip') || 'Bỏ qua';
    }
}

function finishOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    overlay.style.display = 'none';
    chrome.storage.local.set({ onboardingDone: true });
}

// Onboarding event listeners
document.getElementById('btnOnboardingNext')?.addEventListener('click', () => {
    onboardingDirection = 'right';
    currentOnboardingStep++;
    showOnboardingStep();
});

document.getElementById('btnOnboardingPrev')?.addEventListener('click', () => {
    if (currentOnboardingStep > 0) {
        onboardingDirection = 'left';
        currentOnboardingStep--;
        showOnboardingStep();
    }
});

document.getElementById('btnOnboardingSkip')?.addEventListener('click', () => {
    finishOnboarding();
});

// ==========================================
// THÊM CÁC TÍNH NĂNG MỚI (EXTRA FEATURES)
// ==========================================

async function loadTranslations() {
    try {
        const url = chrome.runtime.getURL(`i18n/${currentLang}.json`);
        const response = await fetch(url);
        translations = await response.json();
        applyTranslations();
    } catch (err) {
        console.error("Failed to load i18n", err);
    }
}

function t(key) {
    return translations[key] || key;
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[key]) {
            if (el.tagName === 'INPUT' && el.type === 'text') {
                el.placeholder = translations[key];
            } else {
                el.textContent = translations[key];
            }
        }
    });

    // Update labels array placeholders
    if (labels && labels.length === 5 && labels[0].id === 'name') {
        labels[0].title = t('label_name');
        labels[1].title = t('label_code');
        labels[2].title = t('label_day');
        labels[3].title = t('label_shift');
        labels[4].title = t('label_room');
        renderLabels();
        renderSubjects(); // Update input placeholders
    }
}

function updateStreak() {
    const today = new Date().toISOString().split('T')[0];
    
    if (lastActiveDate !== today) {
        if (!lastActiveDate) {
            currentStreak = 1;
        } else {
            const last = new Date(lastActiveDate);
            const now = new Date(today);
            const diffTime = Math.abs(now - last);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                currentStreak++;
            } else {
                currentStreak = 1;
            }
        }
        lastActiveDate = today;
        saveData();
    }

    const streakText = document.getElementById('streakText');
    if (streakText) {
        if (currentStreak === 1) {
            streakText.textContent = t('streak_first_day');
        } else {
            streakText.textContent = t('streak_text').replace('{count}', currentStreak);
        }
    }
}

function initExtraFeatures() {
    // 1. Language Switch
    const btnLangSwitch = document.getElementById('btnLangSwitch');
    if (btnLangSwitch) {
        btnLangSwitch.addEventListener('click', () => {
            currentLang = currentLang === 'vi' ? 'en' : 'vi';
            saveData();
            loadTranslations();
        });
    }

    // 2. Export CSV
    const btnExportCsv = document.getElementById('btnExportCsv');
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
            if (subjects.length === 0) {
                alert(t('scan_empty_alert'));
                return;
            }
            let csvContent = "";
            const headerRow = labels.map(l => `"${l.title}"`).join(',') + ',"Color"';
            csvContent += headerRow + "\n";

            subjects.forEach(subject => {
                const row = labels.map(l => `"${subject.fields[l.id] || ''}"`).join(',');
                csvContent += row + `,"${subject.color}"\n`;
            });

            const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'danh_sach_mon_hoc_export.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    }

    // 3. Search Filter
    const listSearchInput = document.getElementById('listSearchInput');
    if (listSearchInput) {
        listSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const rows = subjectList.querySelectorAll('.subject-row');
            
            rows.forEach((row, index) => {
                if (!subjects[index]) return;
                const subject = subjects[index];
                const textData = Object.values(subject.fields).join(' ').toLowerCase();
                
                if (textData.includes(query)) {
                    row.style.display = 'flex';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    // 4. QR Share Logic
    const btnShareQR = document.getElementById('btnShareQR');
    const qrModal = document.getElementById('qrModal');
    const btnCloseQr = document.getElementById('btnCloseQr');
    const btnCopyQr = document.getElementById('btnCopyQr');
    const btnImportQr = document.getElementById('btnImportQr');
    let qrCodeInstance = null;

    if (btnShareQR) {
        btnShareQR.addEventListener('click', () => {
            if (subjects.length === 0) {
                alert(t('scan_empty_alert'));
                return;
            }

            const dataToShare = subjects.map(s => {
                const values = labels.map(l => s.fields[l.id] || '');
                return values.join('|');
            }).join('||');

            // Nén dữ liệu cơ bản
            const encoded = btoa(encodeURIComponent(dataToShare));
            document.getElementById('qrShareCode').value = encoded;

            const qrContainer = document.getElementById('qrcode');
            qrContainer.innerHTML = '';
            
            try {
                qrCodeInstance = new QRCode(qrContainer, {
                    text: encoded,
                    width: 200,
                    height: 200,
                    colorDark : "#0f172a",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.L
                });
                qrModal.classList.add('active');
            } catch (e) {
                alert(t('qr_data_too_large'));
            }
        });
    }

    if (btnCloseQr) {
        btnCloseQr.addEventListener('click', () => {
            qrModal.classList.remove('active');
        });
    }

    if (btnCopyQr) {
        btnCopyQr.addEventListener('click', () => {
            const input = document.getElementById('qrShareCode');
            input.select();
            document.execCommand('copy');
            const originalText = btnCopyQr.textContent;
            btnCopyQr.textContent = t('qr_copied');
            setTimeout(() => { btnCopyQr.textContent = originalText; }, 2000);
        });
    }

    if (btnImportQr) {
        btnImportQr.addEventListener('click', () => {
            const input = document.getElementById('qrImportInput');
            const code = input.value.trim();
            if (!code) return;

            try {
                const decoded = decodeURIComponent(atob(code));
                const subjectStrings = decoded.split('||');
                
                subjectStrings.forEach((sStr, i) => {
                    const values = sStr.split('|');
                    const subject = {
                        id: Date.now() + i,
                        fields: {},
                        isActive: true,
                        color: highlightColors[subjects.length % highlightColors.length]
                    };
                    labels.forEach((label, idx) => {
                        subject.fields[label.id] = values[idx] || '';
                    });
                    subjects.push(subject);
                });
                
                saveData();
                renderSubjects();
                qrModal.classList.remove('active');
                input.value = '';
                alert(t('qr_import_success'));
            } catch (e) {
                alert(t('qr_import_error'));
            }
        });
    }

    // Đóng QR modal khi click ngoài
    window.addEventListener('click', (e) => {
        if (e.target === qrModal) {
            qrModal.classList.remove('active');
        }
    });
}
