// Content Script cho VNU Extension
(function() {
    if (window.vnuExtensionLoaded) {
        return;
    }
    window.vnuExtensionLoaded = true;

    // Biến lưu trữ trạng thái các kết quả tìm kiếm của từng môn học
    const subjectMatches = {};

    // Lắng nghe message từ Popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "HIGHLIGHT") {
            const { subjectId, queries, color } = request;
            
            removeOldHighlights(subjectId);
            
            subjectMatches[subjectId] = { currentIndex: 0, elements: [] };

            queries.forEach(query => {
                const matches = highlightText(document.body, query, color, subjectId);
                subjectMatches[subjectId].elements.push(...matches);
            });

            // Cuộn đến kết quả đầu tiên
            if (subjectMatches[subjectId].elements.length > 0) {
                subjectMatches[subjectId].elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            
            sendResponse({ success: true, count: subjectMatches[subjectId].elements.length });
        } 
        else if (request.action === "HIGHLIGHT_ALL") {
            const { subjects } = request;
            
            removeOldHighlights(); // Xóa tất cả
            
            subjects.forEach(subject => {
                subjectMatches[subject.subjectId] = { currentIndex: 0, elements: [] };
                subject.queries.forEach(query => {
                    const matches = highlightText(document.body, query, subject.color, subject.subjectId);
                    subjectMatches[subject.subjectId].elements.push(...matches);
                });
            });

            sendResponse({ success: true });
        }
        else if (request.action === "NAVIGATE") {
            const { subjectId, direction } = request;
            const matchData = subjectMatches[subjectId];
            
            if (matchData && matchData.elements.length > 0) {
                if (direction === 'next') {
                    matchData.currentIndex = (matchData.currentIndex + 1) % matchData.elements.length;
                } else if (direction === 'prev') {
                    matchData.currentIndex = (matchData.currentIndex - 1 + matchData.elements.length) % matchData.elements.length;
                }
                
                matchData.elements[matchData.currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            sendResponse({ success: true });
        }
        else if (request.action === "INJECT_PANEL") {
            injectFloatingPanel();
            sendResponse({ success: true });
        }
        
        return true; // Giữ channel mở (Rất quan trọng trên Firefox)
    });

    // --- Floating Panel Logic ---
    let floatingPanel = null;
    let isPanelPinned = false;

    function injectFloatingPanel() {
        if (document.getElementById('vnu-extension-panel')) return; // Đã nhúng rồi

        // Tạo wrapper
        floatingPanel = document.createElement('div');
        floatingPanel.id = 'vnu-extension-panel';
        floatingPanel.style.position = 'fixed';
        floatingPanel.style.zIndex = '9999999';
        floatingPanel.style.top = '20px';
        floatingPanel.style.right = '20px';
        floatingPanel.style.width = '650px';
        floatingPanel.style.height = '600px';
        floatingPanel.style.minWidth = '450px';
        floatingPanel.style.minHeight = '300px';
        floatingPanel.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
        floatingPanel.style.borderRadius = '12px';
        floatingPanel.style.overflow = 'hidden';
        floatingPanel.style.backgroundColor = '#f9fafb';

        // Tạo iframe
        const iframe = document.createElement('iframe');
        iframe.id = 'vnu-extension-iframe';
        iframe.src = chrome.runtime.getURL('popup/popup.html?mode=iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.display = 'block';
        
        floatingPanel.appendChild(iframe);
        document.body.appendChild(floatingPanel);

        // --- Custom Resize Handles ---
        const directions = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
        directions.forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `vnu-resizer`;
            handle.style.position = 'absolute';
            handle.style.zIndex = '999999';
            
            // Cursor
            if (dir === 'n' || dir === 's') handle.style.cursor = 'ns-resize';
            if (dir === 'e' || dir === 'w') handle.style.cursor = 'ew-resize';
            if (dir === 'ne' || dir === 'sw') handle.style.cursor = 'nesw-resize';
            if (dir === 'nw' || dir === 'se') handle.style.cursor = 'nwse-resize';
            
            // Kích thước vùng bắt chuột
            const size = '8px';
            if (dir.includes('n')) { handle.style.top = '0'; handle.style.height = size; }
            if (dir.includes('s')) { handle.style.bottom = '0'; handle.style.height = size; }
            if (dir.includes('e')) { handle.style.right = '0'; handle.style.width = size; }
            if (dir.includes('w')) { handle.style.left = '0'; handle.style.width = size; }
            
            if (dir === 'n' || dir === 's') { handle.style.left = '0'; handle.style.width = '100%'; }
            if (dir === 'e' || dir === 'w') { handle.style.top = '0'; handle.style.height = '100%'; }
            
            if (dir.length === 2) {
                handle.style.width = '12px';
                handle.style.height = '12px';
            }
            
            handle.addEventListener('mousedown', (e) => initResize(e, dir));
            floatingPanel.appendChild(handle);
        });

        // Bắt sự kiện click ra ngoài để đóng (nếu chưa ghim)
        document.addEventListener('mousedown', handleOutsideClick);
    }

    // Logic Resize
    let isResizing = false;
    let currentResizerDir = '';
    let startX, startY, startWidth, startHeight, startTop, startLeft;

    function initResize(e, dir) {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        currentResizerDir = dir;
        
        startX = e.clientX;
        startY = e.clientY;
        
        const rect = floatingPanel.getBoundingClientRect();
        startWidth = rect.width;
        startHeight = rect.height;
        startTop = rect.top;
        startLeft = rect.left;

        // Vô hiệu hóa pointer-events của iframe để chuột không bị lọt vào iframe
        const iframe = document.getElementById('vnu-extension-iframe');
        if (iframe) iframe.style.pointerEvents = 'none';

        window.addEventListener('mousemove', resizePanel);
        window.addEventListener('mouseup', stopResize);
    }

    function resizePanel(e) {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        let newWidth = startWidth;
        let newHeight = startHeight;
        let newTop = startTop;
        let newLeft = startLeft;

        if (currentResizerDir.includes('e')) newWidth = startWidth + dx;
        if (currentResizerDir.includes('w')) {
            newWidth = startWidth - dx;
            newLeft = startLeft + dx;
        }
        if (currentResizerDir.includes('s')) newHeight = startHeight + dy;
        if (currentResizerDir.includes('n')) {
            newHeight = startHeight - dy;
            newTop = startTop + dy;
        }

        // Min width / height
        if (newWidth >= 450) {
            floatingPanel.style.width = newWidth + 'px';
            if (currentResizerDir.includes('w')) floatingPanel.style.left = newLeft + 'px';
        }
        if (newHeight >= 300) {
            floatingPanel.style.height = newHeight + 'px';
            if (currentResizerDir.includes('n')) floatingPanel.style.top = newTop + 'px';
        }
    }

    function stopResize() {
        if (isResizing) {
            isResizing = false;
            window.removeEventListener('mousemove', resizePanel);
            window.removeEventListener('mouseup', stopResize);
            
            // Mở lại pointer-events cho iframe
            const iframe = document.getElementById('vnu-extension-iframe');
            if (iframe) iframe.style.pointerEvents = 'auto';
        }
    }

    function handleOutsideClick(e) {
        if (floatingPanel && !isPanelPinned) {
            if (!floatingPanel.contains(e.target)) {
                floatingPanel.remove();
                floatingPanel = null;
                document.removeEventListener('mousedown', handleOutsideClick);
            }
        }
    }

    // Lắng nghe message từ Iframe (gửi bằng window.parent.postMessage)
    window.addEventListener('message', (event) => {
        if (event.data && typeof event.data === 'object') {
            const { action, dx, dy, isPinned } = event.data;
            
            if (action === 'PIN_STATE') {
                isPanelPinned = isPinned;
            } 
            else if (action === 'DRAG_MOVE' && floatingPanel) {
                const rect = floatingPanel.getBoundingClientRect();
                // Cập nhật vị trí
                let newTop = rect.top + dy;
                let newLeft = rect.left + dx;
                
                // Giữ cho cửa sổ không bay khỏi màn hình
                newTop = Math.max(0, Math.min(newTop, window.innerHeight - 50));
                newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 100));

                floatingPanel.style.top = newTop + 'px';
                floatingPanel.style.left = newLeft + 'px';
                floatingPanel.style.bottom = 'auto'; // Xóa bottom/right nếu có
                floatingPanel.style.right = 'auto';
            }
        }
    });

    function removeOldHighlights(subjectId = null) {
        const selector = subjectId 
            ? `mark.vnu-extension-highlight[data-subject-id="${subjectId}"]`
            : `mark.vnu-extension-highlight`;
            
        const marks = document.querySelectorAll(selector);
        marks.forEach(mark => {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        });

        if (subjectId) {
            delete subjectMatches[subjectId];
        } else {
            Object.keys(subjectMatches).forEach(key => delete subjectMatches[key]);
        }
    }

    // Đệ quy để tìm và bọc text bằng thẻ <mark>
    function highlightText(element, query, color, subjectId) {
        const matches = [];
        const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');

        // Bỏ qua các thẻ không cần thiết
        if (['SCRIPT', 'STYLE', 'MARK', 'NOSCRIPT', 'TEXTAREA'].includes(element.tagName)) {
            return matches;
        }

        const childNodes = Array.from(element.childNodes);

        for (let child of childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                const text = child.nodeValue;
                if (regex.test(text) && text.trim().length > 0) {
                    const fragment = document.createDocumentFragment();
                    let lastIdx = 0;
                    
                    regex.lastIndex = 0;
                    let match;

                    while ((match = regex.exec(text)) !== null) {
                        const before = text.substring(lastIdx, match.index);
                        if (before.length > 0) {
                            fragment.appendChild(document.createTextNode(before));
                        }

                        const mark = document.createElement('mark');
                        mark.className = 'vnu-extension-highlight';
                        mark.dataset.subjectId = subjectId;
                        mark.style.backgroundColor = color;
                        mark.style.color = '#000';
                        mark.style.borderRadius = '2px';
                        mark.style.padding = '0 2px';
                        mark.textContent = match[0];
                        fragment.appendChild(mark);
                        matches.push(mark);

                        lastIdx = match.index + match[0].length;
                    }

                    const after = text.substring(lastIdx);
                    if (after.length > 0) {
                        fragment.appendChild(document.createTextNode(after));
                    }

                    child.parentNode.replaceChild(fragment, child);
                }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                matches.push(...highlightText(child, query, color, subjectId));
            }
        }

        return matches;
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
})();
