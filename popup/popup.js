// State mặc định
const DEFAULT_LABELS = {
    name: "Tên môn học",
    code: "Mã lớp học phần",
    day: "Thứ",
    shift: "Ca",
    room: "Giảng đường"
};

let labels = { ...DEFAULT_LABELS };
let subjects = [];
let isIframeMode = window.location.search.includes('mode=iframe');
let isPinned = false;

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
});

// Load dữ liệu từ storage
async function loadData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['subjects', 'labels', 'isPinned'], (result) => {
            if (result.subjects) subjects = result.subjects;
            else subjects = [{ id: Date.now(), name: '', code: '', day: '', shift: '', room: '', color: '#ffff00' }];
            
            if (result.labels) labels = result.labels;
            if (result.isPinned) isPinned = result.isPinned;
            resolve();
        });
    });
}

// Lưu dữ liệu vào storage
function saveData() {
    chrome.storage.local.set({ subjects, labels });
}

// Cập nhật placeholder dựa trên labels
function renderLabels() {
    document.getElementById('labelName').value = labels.name;
    document.getElementById('labelCode').value = labels.code;
    document.getElementById('labelDay').value = labels.day;
    document.getElementById('labelShift').value = labels.shift;
    document.getElementById('labelRoom').value = labels.room;

    // Cập nhật các input hiện tại
    const rows = subjectList.querySelectorAll('.subject-row');
    rows.forEach(row => {
        row.querySelector('.input-name').placeholder = labels.name;
        row.querySelector('.input-code').placeholder = labels.code;
        row.querySelector('.input-day').placeholder = labels.day;
        row.querySelector('.input-shift').placeholder = labels.shift;
        row.querySelector('.input-room').placeholder = labels.room;
    });
}

// Render danh sách môn học
function renderSubjects() {
    subjectList.innerHTML = '';
    const template = document.getElementById('subjectRowTemplate');

    subjects.forEach((subject, index) => {
        const clone = template.content.cloneNode(true);
        const row = clone.querySelector('.subject-row');
        
        const inputName = row.querySelector('.input-name');
        const inputCode = row.querySelector('.input-code');
        const inputDay = row.querySelector('.input-day');
        const inputShift = row.querySelector('.input-shift');
        const inputRoom = row.querySelector('.input-room');
        const inputColor = row.querySelector('.input-color');

        // Gán placeholder
        inputName.placeholder = labels.name;
        inputCode.placeholder = labels.code;
        inputDay.placeholder = labels.day;
        inputShift.placeholder = labels.shift;
        inputRoom.placeholder = labels.room;

        // Gán value
        inputName.value = subject.name || '';
        inputCode.value = subject.code || '';
        inputDay.value = subject.day || '';
        inputShift.value = subject.shift || '';
        inputRoom.value = subject.room || '';
        inputColor.value = subject.color || '#ffff00';

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
        btnDelete.addEventListener('click', () => {
            subjects.splice(index, 1);
            saveData();
            
            // Xóa highlight của subject này trên trang khi bị xóa khỏi danh sách
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "HIGHLIGHT",
                        subjectId: subject.id,
                        queries: [], // mảng rỗng sẽ xóa toàn bộ highlight của id này
                        color: subject.color
                    });
                }
            });
            
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

        subjectList.appendChild(clone);
    });
}

// Thêm môn học
btnAdd.addEventListener('click', () => {
    subjects.push({
        id: Date.now(),
        name: '', code: '', day: '', shift: '', room: '', color: '#ffff00'
    });
    saveData();
    renderSubjects();
    
    // Scroll to bottom
    setTimeout(() => {
        subjectList.scrollTop = subjectList.scrollHeight;
    }, 50);
});

// Xóa tất cả
btnClearAll.addEventListener('click', () => {
    if (confirm("Bạn chắc chưa? Hành động này sẽ xóa tất cả các môn học trong danh sách.")) {
        subjects = [];
        saveData();
        
        // Xóa sạch highlight trên trang
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "HIGHLIGHT_ALL", subjects: [] });
            }
        });

        renderSubjects();
    }
});

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
    
    saveData();
    renderLabels();
    alert("Đã lưu cài đặt!");
    btnCloseSettings.click();
});

// Khôi phục cài đặt gốc
btnResetSettings.addEventListener('click', () => {
    if (confirm("Bạn chắc chưa? Các nhãn sẽ được khôi phục về mặc định.")) {
        labels = { ...DEFAULT_LABELS };
        renderLabels();
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
        const matches = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        if (!matches) continue;
        
        const row = matches.map(m => m.replace(/^"|"$/g, '').trim());
        
        subjects.push({
            id: Date.now() + i,
            name: row[0] || '',
            code: row[1] || '',
            day: row[2] || '',
            shift: row[3] || '',
            room: row[4] || '',
            color: row[5] || '#ffff00'
        });
    }

    saveData();
    renderSubjects();
    alert("Đã tải dữ liệu thành công!");
}

// --- Logic Gửi lệnh Tìm kiếm ---
async function performSearch(subject) {
    const queries = [subject.name, subject.code, subject.day, subject.shift, subject.room]
        .filter(q => q && q.trim().length > 0)
        .map(q => q.trim());
        
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
        chrome.tabs.sendMessage(tab.id, {
            action: "HIGHLIGHT",
            subjectId: subject.id,
            queries: queries,
            color: subject.color
        });
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

    const payload = subjects.map(s => {
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

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
        chrome.tabs.sendMessage(tab.id, {
            action: "HIGHLIGHT_ALL",
            subjects: payload
        });
    } catch (err) {
        console.error(err);
        alert("Không thể quét trên trang này.");
    }
});

// Logic Điều hướng
async function performNavigation(subjectId, direction) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    try {
        chrome.tabs.sendMessage(tab.id, {
            action: "NAVIGATE",
            subjectId: subjectId,
            direction: direction
        });
    } catch (err) {
        console.error(err);
    }
}

// --- Logic Floating Panel (Cửa sổ nổi) & Drag ---
const btnTogglePin = document.getElementById('btnTogglePin');
const header = document.querySelector('.header');

if (isIframeMode) {
    header.classList.add('draggable');
    updatePinButton();

    btnTogglePin.addEventListener('click', () => {
        isPinned = !isPinned;
        chrome.storage.local.set({ isPinned });
        updatePinButton();
        
        // Báo cho parent window biết trạng thái ghim
        window.parent.postMessage({ action: 'PIN_STATE', isPinned }, '*');
    });

    // Logic Kéo thả
    let isDragging = false;
    let startX, startY;

    header.addEventListener('mousedown', (e) => {
        // Không kéo nếu click vào các nút
        if (e.target.tagName.toLowerCase() === 'button') return;
        
        isDragging = true;
        startX = e.screenX;
        startY = e.screenY;
        window.parent.postMessage({ action: 'DRAG_START' }, '*');
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.screenX - startX;
        const dy = e.screenY - startY;
        startX = e.screenX;
        startY = e.screenY;
        window.parent.postMessage({ action: 'DRAG_MOVE', dx, dy }, '*');
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            window.parent.postMessage({ action: 'DRAG_END' }, '*');
        }
    });

} else {
    // Nếu là popup gốc
    btnTogglePin.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            alert("Không tìm thấy tab.");
            return;
        }

        try {
            chrome.tabs.sendMessage(tab.id, { action: "INJECT_PANEL" }, (response) => {
                if (chrome.runtime.lastError) {
                    const msg = chrome.runtime.lastError.message;
                    if (msg.includes("Receiving end does not exist") || msg.includes("Could not establish connection")) {
                        alert("BẠN PHẢI BẤM F5 (TẢI LẠI TRANG WEB) TRƯỚC! Tính năng Nổi mới hoạt động được nha!");
                    } else {
                        alert("Lỗi: " + msg);
                    }
                } else {
                    // Thành công
                    setTimeout(() => window.close(), 100);
                }
            });
        } catch (err) {
            console.error(err);
            alert("Vui lòng tải lại (F5) trang web này trước khi ghim cửa sổ.");
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
const originalWidth = document.body.style.width;

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
