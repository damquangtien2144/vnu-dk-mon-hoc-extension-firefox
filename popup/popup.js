// State mặc định
const DEFAULT_LABELS = {
    name: "Tên môn học",
    code: "Mã lớp học phần",
    day: "Thứ",
    shift: "Ca",
    room: "Giảng đường"
};

const DEFAULT_HIGHLIGHT_SETTINGS = {
    style: 'background',
    opacity: 100
};

let labels = { ...DEFAULT_LABELS };
let highlightSettings = { ...DEFAULT_HIGHLIGHT_SETTINGS };
let subjects = [];
let isIframeMode = window.location.search.includes('mode=iframe');
let isPinned = false;

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
    renderLabels();
    renderSubjects();
    initHighlightSettingsUI();
    checkOnboarding();
});

// Load dữ liệu từ storage
async function loadData() {
    const result = await browser.storage.local.get(['subjects', 'labels', 'isPinned', 'highlightSettings', 'onboardingDone']);
    if (result.subjects) subjects = result.subjects;
    else subjects = [{ id: Date.now(), name: '', code: '', day: '', shift: '', room: '', color: '#ffff00' }];
    
    if (result.labels) labels = result.labels;
    if (result.isPinned) isPinned = result.isPinned;
    if (result.highlightSettings) highlightSettings = result.highlightSettings;
}

// Lưu dữ liệu vào storage
function saveData() {
    browser.storage.local.set({ subjects, labels, highlightSettings });
}

// Cập nhật placeholder dựa trên labels
function renderLabels() {
    document.getElementById('labelName').value = labels.name;
    document.getElementById('labelCode').value = labels.code;
    document.getElementById('labelDay').value = labels.day;
    document.getElementById('labelShift').value = labels.shift;
    document.getElementById('labelRoom').value = labels.room;
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
        
        const inputName = row.querySelector('.input-name');
        const inputCode = row.querySelector('.input-code');
        const inputDay = row.querySelector('.input-day');
        const inputShift = row.querySelector('.input-shift');
        const inputRoom = row.querySelector('.input-room');
        const inputColor = row.querySelector('.input-color');

        // Gán value
        inputName.value = subject.name || '';
        inputCode.value = subject.code || '';
        inputDay.value = subject.day || '';
        inputShift.value = subject.shift || '';
        inputRoom.value = subject.room || '';
        inputColor.value = subject.color || '#ffff00';

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
                // Auto search again when enabled
                performSearch(subject);
            } else {
                row.classList.add('disabled');
                // Clear highlights when disabled
                browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        browser.tabs.sendMessage(tabs[0].id, {
                            action: "HIGHLIGHT",
                            subjectId: subject.id,
                            queries: [],
                            color: subject.color,
                            highlightSettings: highlightSettings
                        });
                    }
                });
                // Reset counter
                updateMatchCounter(subject.id, 0, 0);
            }
            saveData();
        });

        // Khôi phục match counter nếu có
        const counter = row.querySelector('.match-counter');
        if (matchCounts[subject.id] && matchCounts[subject.id].total > 0) {
            const mc = matchCounts[subject.id];
            counter.textContent = `${mc.current + 1}/${mc.total}`;
            counter.style.display = 'inline-flex';
        }

        // Lắng nghe thay đổi để lưu lại
        const saveOnChange = (e) => {
            subject.name = inputName.value;
            subject.code = inputCode.value;
            subject.day = inputDay.value;
            subject.shift = inputShift.value;
            subject.room = inputRoom.value;
            subject.color = inputColor.value;
            saveData();

            // Nếu người dùng xóa trắng một ô hoặc đổi màu, tự động cập nhật highlight trên trang
            if (e && (e.target.value.trim() === '' || e.target.type === 'color')) {
                performSearch(subject);
            }
        };

        inputName.addEventListener('input', saveOnChange);
        inputCode.addEventListener('input', saveOnChange);
        inputDay.addEventListener('input', saveOnChange);
        inputShift.addEventListener('input', saveOnChange);
        inputRoom.addEventListener('input', saveOnChange);
        inputColor.addEventListener('input', saveOnChange);

        // Nút Xóa
        const btnDelete = row.querySelector('.btn-delete');
        btnDelete.addEventListener('click', async () => {
            subjects.splice(index, 1);
            delete matchCounts[subject.id];
            saveData();
            
            // Xóa highlight của subject này trên trang khi bị xóa khỏi danh sách
            try {
                const tabs = await browser.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]) {
                    browser.tabs.sendMessage(tabs[0].id, {
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

        // Điều hướng (Next/Prev)
        const btnPrev = row.querySelector('.btn-prev');
        const btnNext = row.querySelector('.btn-next');
        
        btnPrev.addEventListener('click', () => {
            performNavigation(subject.id, 'prev');
        });
        
        btnNext.addEventListener('click', () => {
            performNavigation(subject.id, 'next');
        });

        // Phím tắt Enter
        const inputs = row.querySelectorAll('input[type="text"]');
        inputs.forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    btnSearch.click();
                }
            });
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
btnAdd.addEventListener('click', () => {
    subjects.push({
        id: Date.now(),
        name: '', code: '', day: '', shift: '', room: '', color: '#ffff00', isActive: true
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
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                browser.tabs.sendMessage(tabs[0].id, { action: "HIGHLIGHT_ALL", subjects: [] }).catch(e => console.error(e));
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
            browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    browser.tabs.sendMessage(tabs[0].id, { action: "HIGHLIGHT_ALL", subjects: [] });
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
    labels.name = document.getElementById('labelName').value;
    labels.code = document.getElementById('labelCode').value;
    labels.day = document.getElementById('labelDay').value;
    labels.shift = document.getElementById('labelShift').value;
    labels.room = document.getElementById('labelRoom').value;
    
    // Feature #14: Lưu highlight settings
    highlightSettings.style = document.getElementById('highlightStyle').value;
    highlightSettings.opacity = parseInt(document.getElementById('highlightOpacity').value);
    
    saveData();
    renderLabels();
    alert("Đã lưu cài đặt!");
    btnCloseSettings.click();
});

// Khôi phục cài đặt gốc
btnResetSettings.addEventListener('click', () => {
    if (confirm("Bạn chắc chưa? Các nhãn và cài đặt highlight sẽ được khôi phục về mặc định.")) {
        labels = { ...DEFAULT_LABELS };
        highlightSettings = { ...DEFAULT_HIGHLIGHT_SETTINGS };
        renderLabels();
        initHighlightSettingsUI();
        saveData();
    }
});

// --- Chức năng CSV ---
btnDownloadTemplate.addEventListener('click', () => {
    const csvContent = `"Tên môn học","Mã lớp học phần","Thứ","Ca","Giảng đường","Màu Highlight"
"Giải tích 1","MAT1092","3","1-2","G2-101","#FFFF00"
"Đại số tuyến tính","MAT1093","4","3-4","G2-102","#00FF00"`;
    
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
        
        subjects.push({
            id: Date.now() + i,
            name: row[0] || '',
            code: row[1] || '',
            day: row[2] || '',
            shift: row[3] || '',
            room: row[4] || '',
            color: row[5] || '#ffff00',
            isActive: true
        });
    }

    saveData();
    renderSubjects();
    alert("Đã tải dữ liệu thành công!");
}

// --- Logic Gửi lệnh Tìm kiếm (Feature #6: nhận response cập nhật counter) ---
async function performSearch(subject) {
    if (subject.isActive === false) return; // Không tìm nếu đang tắt
    
    const queries = [subject.name, subject.code, subject.day, subject.shift, subject.room]
        .filter(q => q && q.trim().length > 0)
        .map(q => q.trim());
        
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
        await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['scripts/content.js'] });
        const response = await browser.tabs.sendMessage(tab.id, {
            action: "HIGHLIGHT",
            subjectId: subject.id,
            queries: queries,
            color: subject.color,
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
            queries: [s.name, s.code, s.day, s.shift, s.room].filter(q => q && q.trim().length > 0).map(q => q.trim())
        };
    }).filter(s => s.queries.length > 0);

    if (payload.length === 0) {
        alert("Các môn học chưa có thông tin hợp lệ để quét.");
        return;
    }

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
        await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['scripts/content.js'] });
        browser.tabs.sendMessage(tab.id, {
            action: "HIGHLIGHT_ALL",
            subjects: payload,
            highlightSettings: highlightSettings
        }, (response) => {
            if (browser.runtime.lastError) return;
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
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    try {
        await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['scripts/content.js'] });
        const response = await browser.tabs.sendMessage(tab.id, {
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
        browser.storage.local.set({ isPinned });
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
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        try {
            await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['scripts/content.js'] });
            browser.tabs.sendMessage(tab.id, { action: "INJECT_PANEL" });
            window.close(); // Đóng popup gốc
        } catch (err) {
            console.error(err);
            alert("Không thể nhúng cửa sổ nổi trên trang này.");
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
        document.body.style.width = '600px';
        document.body.style.height = '600px';
        donateModal.classList.add('active');
    });
}

function closeDonateModal() {
    document.body.style.width = '650px';
    document.body.style.height = 'auto';
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
        // Đóng onboarding nếu đang mở
        const overlay = document.getElementById('onboardingOverlay');
        if (overlay && overlay.style.display !== 'none') {
            finishOnboarding();
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

// ======= Feature #15: Onboarding Tour =======
const ONBOARDING_STEPS = [
    {
        target: '.inputs-grid',
        text: '👋 Chào mừng bạn! Nhập thông tin môn học tại đây: tên môn, mã lớp, thứ, ca, giảng đường.',
        position: 'bottom'
    },
    {
        target: '.btn-search',
        text: '🔍 Bấm nút này để highlight (tô sáng) môn học trên trang đăng ký.',
        position: 'bottom'
    },
    {
        target: '.btn-prev',
        text: '⬆️⬇️ Dùng nút ▲▼ để di chuyển giữa các kết quả tìm thấy trên trang.',
        position: 'bottom'
    },
    {
        target: '#btnScanAll',
        text: '⚡ Bấm "Quét tất cả" để highlight TẤT CẢ các môn trong danh sách cùng lúc! Phím tắt: Ctrl+Shift+S',
        position: 'bottom'
    },
    {
        target: '#btnTogglePin',
        text: '📌 Chuyển thành cửa sổ nổi để vừa xem trang web vừa tìm kiếm!',
        position: 'bottom'
    }
];

let currentOnboardingStep = 0;

function checkOnboarding() {
    browser.storage.local.get(['onboardingDone'], (result) => {
        if (!result.onboardingDone) {
            // Đợi 1 chút để DOM render xong
            setTimeout(() => startOnboarding(), 500);
        }
    });
}

function startOnboarding() {
    currentOnboardingStep = 0;
    showOnboardingStep();
}

function showOnboardingStep() {
    const overlay = document.getElementById('onboardingOverlay');
    const tooltip = overlay.querySelector('.onboarding-tooltip');
    const textEl = overlay.querySelector('.onboarding-text');
    const dotsEl = overlay.querySelector('.onboarding-dots');
    const nextBtn = document.getElementById('btnOnboardingNext');

    if (currentOnboardingStep >= ONBOARDING_STEPS.length) {
        finishOnboarding();
        return;
    }

    const step = ONBOARDING_STEPS[currentOnboardingStep];
    
    // Xóa spotlight cũ
    document.querySelectorAll('.onboarding-spotlight').forEach(el => el.classList.remove('onboarding-spotlight'));

    // Tìm target element
    const target = document.querySelector(step.target);
    if (!target) {
        currentOnboardingStep++;
        showOnboardingStep();
        return;
    }

    // Spotlight target
    target.classList.add('onboarding-spotlight');

    // Cập nhật text
    textEl.textContent = step.text;

    // Cập nhật dots
    dotsEl.innerHTML = ONBOARDING_STEPS.map((_, i) => 
        `<span class="onboarding-dot ${i === currentOnboardingStep ? 'active' : ''}"></span>`
    ).join('');

    // Cập nhật nút
    if (currentOnboardingStep === ONBOARDING_STEPS.length - 1) {
        nextBtn.textContent = '✅ Hoàn thành';
    } else {
        nextBtn.textContent = 'Tiếp theo →';
    }

    // Vị trí tooltip
    const rect = target.getBoundingClientRect();
    tooltip.classList.remove('arrow-top', 'arrow-bottom', 'arrow-left');
    
    if (step.position === 'bottom') {
        tooltip.style.top = (rect.bottom + 12) + 'px';
        tooltip.style.left = Math.max(10, rect.left) + 'px';
        tooltip.classList.add('arrow-top');
    } else {
        tooltip.style.top = (rect.top - tooltip.offsetHeight - 12) + 'px';
        tooltip.style.left = Math.max(10, rect.left) + 'px';
        tooltip.classList.add('arrow-bottom');
    }

    overlay.style.display = 'block';
}

function finishOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    overlay.style.display = 'none';
    document.querySelectorAll('.onboarding-spotlight').forEach(el => el.classList.remove('onboarding-spotlight'));
    browser.storage.local.set({ onboardingDone: true });
}

// Onboarding event listeners
document.getElementById('btnOnboardingNext')?.addEventListener('click', () => {
    currentOnboardingStep++;
    showOnboardingStep();
});

document.getElementById('btnOnboardingSkip')?.addEventListener('click', () => {
    finishOnboarding();
});
