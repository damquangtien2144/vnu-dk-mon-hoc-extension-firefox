// Content Script cho VNU Extension

if (typeof window.vnuExtensionLoaded === 'undefined') {
    window.vnuExtensionLoaded = true;

    // Inject custom CSS for highlight blinking animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes vnu-blink-anim {
            50% { 
                background-color: transparent; 
                border-color: transparent;
                text-decoration-color: transparent;
                text-shadow: none;
                color: inherit;
            }
        }
        .vnu-blink {
            animation: vnu-blink-anim 1s infinite !important;
        }
    `;
    document.head.appendChild(style);

    // Biến lưu trữ trạng thái các kết quả tìm kiếm của từng môn học
    const subjectMatches = {};

    // Lắng nghe message từ Popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "HIGHLIGHT") {
            const { subjectId, queries, color, highlightSettings } = request;
            
            removeOldHighlights(subjectId);
            
            subjectMatches[subjectId] = { currentIndex: 0, elements: [] };

            if (!queries || queries.length === 0) {
                sendResponse({ 
                    success: true, 
                    count: 0,
                    currentIndex: 0
                });
                return;
            }

            const regexPatterns = queries.map(q => {
                const norm = normalizeVn(q).trim();
                return escapeRegExp(norm).replace(/\s+/g, '\\s+');
            });
            const regexQueries = regexPatterns.map(p => new RegExp(p, 'i'));

            const containers = findSmallestContainers(document.body, regexQueries);
            
            containers.forEach(container => {
                regexPatterns.forEach(pattern => {
                    highlightText(container, pattern, color, subjectId, highlightSettings, { count: 0, limit: 1 });
                });
            });

            // Thay vì lưu từng từ đơn, ta lưu toàn bộ container (dòng) để chuyển hướng
            subjectMatches[subjectId].elements = containers;

            // Cuộn đến kết quả đầu tiên + đánh dấu focus
            if (subjectMatches[subjectId].elements.length > 0) {
                setFocusHighlight(subjectId, 0);
                subjectMatches[subjectId].elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Phục hồi trạng thái nhấp nháy
            if (request.isBlinking) {
                const marks = document.querySelectorAll(`mark.vnu-extension-highlight[data-subject-id="${subjectId}"]`);
                marks.forEach(mark => mark.classList.add('vnu-blink'));
            }
            
            sendResponse({ 
                success: true, 
                count: subjectMatches[subjectId].elements.length,
                currentIndex: 0
            });
        } 
        else if (request.action === "HIGHLIGHT_ALL") {
            const { subjects, highlightSettings } = request;
            
            removeOldHighlights(); // Xóa tất cả
            
            const counts = {};
            
            subjects.forEach(subject => {
                subjectMatches[subject.subjectId] = { currentIndex: 0, elements: [] };
                
                if (!subject.queries || subject.queries.length === 0) {
                    counts[subject.subjectId] = 0;
                    return; // Skip empty queries
                }

                const regexPatterns = subject.queries.map(q => {
                    const norm = normalizeVn(q).trim();
                    return escapeRegExp(norm).replace(/\s+/g, '\\s+');
                });
                const regexQueries = regexPatterns.map(p => new RegExp(p, 'i'));

                const containers = findSmallestContainers(document.body, regexQueries);
                containers.forEach(container => {
                    regexPatterns.forEach(pattern => {
                        highlightText(container, pattern, subject.color, subject.subjectId, highlightSettings, { count: 0, limit: 1 });
                    });
                });
                
                subjectMatches[subject.subjectId].elements = containers;
                counts[subject.subjectId] = containers.length;
                
                // Đánh dấu focus cho kết quả đầu tiên của mỗi subject
                if (subjectMatches[subject.subjectId].elements.length > 0) {
                    setFocusHighlight(subject.subjectId, 0);
                }

                // Phục hồi trạng thái nhấp nháy
                if (subject.isBlinking) {
                    const marks = document.querySelectorAll(`mark.vnu-extension-highlight[data-subject-id="${subject.subjectId}"]`);
                    marks.forEach(mark => mark.classList.add('vnu-blink'));
                }
            });

            sendResponse({ success: true, counts: counts });
        }
        else if (request.action === "BLINK_HIGHLIGHT") {
            const { subjectId, isBlinking } = request;
            const marks = document.querySelectorAll(`mark.vnu-extension-highlight[data-subject-id="${subjectId}"]`);
            if (marks.length > 0) {
                marks.forEach(mark => {
                    if (isBlinking) {
                        mark.classList.add('vnu-blink');
                    } else {
                        mark.classList.remove('vnu-blink');
                    }
                });
                sendResponse({ success: true });
            }
        }
        else if (request.action === "NAVIGATE") {
            const { subjectId, direction } = request;
            const matchData = subjectMatches[subjectId];
            
            if (matchData && matchData.elements.length > 0) {
                // Xóa focus cũ
                clearFocusHighlight(subjectId);
                
                if (direction === 'next') {
                    matchData.currentIndex = (matchData.currentIndex + 1) % matchData.elements.length;
                } else if (direction === 'prev') {
                    matchData.currentIndex = (matchData.currentIndex - 1 + matchData.elements.length) % matchData.elements.length;
                }
                
                // Đánh dấu focus mới
                setFocusHighlight(subjectId, matchData.currentIndex);
                matchData.elements[matchData.currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            sendResponse({ 
                success: true,
                currentIndex: matchData ? matchData.currentIndex : 0,
                totalCount: matchData ? matchData.elements.length : 0
            });
        }
        else if (request.action === "INJECT_PANEL") {
            injectFloatingPanel();
            sendResponse({ success: true });
        }
        return true; // Giữ message channel mở cho sendResponse
    });

    // ======= Feature #6: Focus Highlight (Row Level) =======
    function setFocusHighlight(subjectId, index) {
        const matchData = subjectMatches[subjectId];
        if (!matchData || !matchData.elements[index]) return;
        
        const el = matchData.elements[index];
        el.classList.add('vnu-highlight-focus');
        el.style.outline = '3px dashed #ef4444'; // Đổi sang viền đứt nét bao quanh cả dòng
        el.style.outlineOffset = '2px';
        el.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.4)';
    }

    function clearFocusHighlight(subjectId) {
        const matchData = subjectMatches[subjectId];
        if (!matchData) return;
        
        matchData.elements.forEach(el => {
            el.classList.remove('vnu-highlight-focus');
            el.style.outline = '';
            el.style.outlineOffset = '';
            el.style.boxShadow = '';
        });
    }

    // Hàm xóa highlight cũ
    function removeOldHighlights(subjectId = null) {
        // Xóa viền focus của container trước
        if (subjectId) {
            clearFocusHighlight(subjectId);
        } else {
            Object.keys(subjectMatches).forEach(id => clearFocusHighlight(id));
        }

        const selector = subjectId 
            ? `mark.vnu-extension-highlight[data-subject-id="${subjectId}"]`
            : `mark.vnu-extension-highlight`;
            
        const marks = document.querySelectorAll(selector);
        marks.forEach(mark => {
            const parent = mark.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(mark.textContent), mark);
                parent.normalize();
            }
        });
    }

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
        floatingPanel.style.width = '780px';
        floatingPanel.style.height = '600px';
        floatingPanel.style.minWidth = '450px';
        floatingPanel.style.minHeight = '300px';
        floatingPanel.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
        floatingPanel.style.borderRadius = '16px';
        floatingPanel.style.overflow = 'hidden';
        floatingPanel.style.backgroundColor = 'transparent';
        floatingPanel.style.border = '1px solid rgba(255, 255, 255, 0.3)';

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

        // Boundaries
        newTop = Math.max(0, newTop);
        newLeft = Math.max(0, newLeft);

        // Min width / height
        if (newWidth >= 450 && newLeft + newWidth <= window.innerWidth) {
            floatingPanel.style.width = newWidth + 'px';
            if (currentResizerDir.includes('w')) floatingPanel.style.left = newLeft + 'px';
        }
        if (newHeight >= 300 && newTop + newHeight <= window.innerHeight) {
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
    let isPanelDragging = false;
    let dragStartX, dragStartY;
    let initialTop, initialLeft;

    window.addEventListener('message', (event) => {
        if (event.data && typeof event.data === 'object') {
            const { action, iframeX, iframeY, isPinned } = event.data;
            
            if (action === 'PIN_STATE') {
                isPanelPinned = isPinned;
            } 
            else if (action === 'DRAG_START' && floatingPanel) {
                isPanelDragging = true;
                
                // Chặn pointer-events của iframe để window bắt được toàn bộ sự kiện chuột!
                const iframe = document.getElementById('vnu-extension-iframe');
                if (iframe) iframe.style.pointerEvents = 'none';

                const rect = floatingPanel.getBoundingClientRect();
                initialTop = rect.top;
                initialLeft = rect.left;

                dragStartX = rect.left + iframeX;
                dragStartY = rect.top + iframeY;
            }
        }
    });

    // Bắt sự kiện kéo chuột ở tầm toàn cục (trên window của trang web)
    window.addEventListener('mousemove', (e) => {
        if (isPanelDragging && floatingPanel) {
            e.preventDefault(); // Ngăn chặn bôi đen text khi kéo
            
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            
            let newTop = initialTop + dy;
            let newLeft = initialLeft + dx;
            
            // Giữ cho cửa sổ không bay khỏi màn hình
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 50));
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 100));

            floatingPanel.style.top = newTop + 'px';
            floatingPanel.style.left = newLeft + 'px';
            floatingPanel.style.bottom = 'auto'; // Xóa bottom/right nếu có
            floatingPanel.style.right = 'auto';
        }
    });

    // Dừng kéo thả
    window.addEventListener('mouseup', () => {
        if (isPanelDragging) {
            isPanelDragging = false;
            // Mở lại pointer-events cho iframe
            const iframe = document.getElementById('vnu-extension-iframe');
            if (iframe) {
                iframe.style.pointerEvents = 'auto';
                iframe.contentWindow.postMessage({ action: 'DRAG_END' }, '*');
            }
        }
    });



    function findSmallestContainers(node, regexQueries) {
        const containers = [];
        if (!node || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName)) return containers;

        const text = normalizeVn(node.textContent);
        const hasAll = regexQueries.every(regex => regex.test(text));
        
        if (!hasAll) return containers;

        let childHasAll = false;
        for (let child of node.children) {
            if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(child.tagName)) continue;
            
            const childText = normalizeVn(child.textContent);
            if (regexQueries.every(regex => regex.test(childText))) {
                childHasAll = true;
                containers.push(...findSmallestContainers(child, regexQueries));
            }
        }

        if (!childHasAll) {
            // Khóa chặn: Không bao giờ chấp nhận các thẻ mang tính chất "bọc nhiều dòng" làm kết quả
            // Nếu các từ khóa nằm rải rác ở các dòng khác nhau (VD: "học" ở dòng 1, "máy" ở dòng 2)
            // thì thùng chứa chung của chúng sẽ là TBODY hoặc TABLE. Ta phải loại bỏ ngay lập tức!
            const invalidMultiRowTags = ['TBODY', 'TABLE', 'THEAD', 'TFOOT', 'UL', 'OL', 'DL', 'BODY', 'MAIN', 'ARTICLE', 'SECTION', 'FORM', 'ASIDE', 'NAV'];
            if (invalidMultiRowTags.includes(node.tagName)) {
                return containers;
            }

            // Heuristic quan trọng: Chỉ chấp nhận các container có kích thước nhỏ (như 1 dòng)
            // Nếu là thẻ TR (dòng của bảng) thì luôn chấp nhận. Nếu là thẻ khác, giới hạn 800 ký tự.
            if (node.tagName === 'TR' || node.tagName === 'LI' || node.textContent.trim().length <= 800) {
                containers.push(node);
            }
        }
        
        return containers;
    }

    // ======= Feature #14: Áp dụng highlight style =======
    function applyHighlightStyle(mark, color, highlightSettings) {
        const settings = highlightSettings || { style: 'background', opacity: 100 };
        const opacity = (settings.opacity || 100) / 100;
        
        // Reset tất cả style
        mark.style.backgroundColor = 'transparent';
        mark.style.color = 'inherit';
        mark.style.textDecoration = 'none';
        mark.style.borderBottom = 'none';
        mark.style.fontWeight = 'inherit';
        mark.style.textShadow = 'none';
        
        switch (settings.style) {
            case 'background':
                mark.style.backgroundColor = color;
                mark.style.color = '#000';
                break;
            case 'underline':
                mark.style.textDecoration = `wavy underline ${color}`;
                mark.style.textDecorationThickness = '3px';
                mark.style.textUnderlineOffset = '4px';
                break;
            case 'border':
                mark.style.borderBottom = `3px solid ${color}`;
                mark.style.paddingBottom = '1px';
                break;
            case 'bold':
                mark.style.fontWeight = 'bold';
                mark.style.color = color;
                mark.style.textShadow = `0 0 6px ${color}`;
                break;
            default:
                mark.style.backgroundColor = color;
                mark.style.color = '#000';
        }
        
        mark.style.opacity = opacity;
    }

    // Đệ quy để tìm và bọc text bằng thẻ <mark>
    function highlightText(element, queryRegexPattern, color, subjectId, highlightSettings, matchState = null) {
        const matches = [];
        const regex = new RegExp(queryRegexPattern, 'gi');

        // Bỏ qua các thẻ không cần thiết
        if (['SCRIPT', 'STYLE', 'MARK', 'NOSCRIPT', 'TEXTAREA'].includes(element.tagName)) {
            return matches;
        }

        const childNodes = Array.from(element.childNodes);

        for (let child of childNodes) {
            // Dừng nếu đã đạt limit
            if (matchState && matchState.count >= matchState.limit) break;

            if (child.nodeType === Node.TEXT_NODE) {
                const originalText = child.nodeValue;
                if (originalText.trim().length > 0) {
                    const normText = normalizeVn(originalText);
                    
                    regex.lastIndex = 0;
                    if (!regex.test(normText)) continue;
                    
                    const fragment = document.createDocumentFragment();
                    let lastIdx = 0;
                    
                    regex.lastIndex = 0; // Reset lại sau regex.test()
                    let match;

                    while ((match = regex.exec(normText)) !== null) {
                        if (matchState && matchState.count >= matchState.limit) break;

                        const before = originalText.substring(lastIdx, match.index);
                        if (before.length > 0) {
                            fragment.appendChild(document.createTextNode(before));
                        }

                        const mark = document.createElement('mark');
                        mark.className = 'vnu-extension-highlight';
                        mark.dataset.subjectId = subjectId;
                        mark.style.borderRadius = '2px';
                        mark.style.padding = '0 2px';
                        mark.style.transition = 'all 0.2s ease';
                        
                        // Lấy text gốc để wrap, dựa trên index đã match trên text chuẩn hóa
                        mark.textContent = originalText.substring(match.index, match.index + match[0].length);
                        
                        // Feature #14: Áp dụng highlight style
                        applyHighlightStyle(mark, color, highlightSettings);
                        
                        fragment.appendChild(mark);
                        matches.push(mark);

                        if (matchState) matchState.count++;

                        lastIdx = match.index + match[0].length;
                    }

                    const after = originalText.substring(lastIdx);
                    if (after.length > 0) {
                        fragment.appendChild(document.createTextNode(after));
                    }

                    if (lastIdx > 0) {
                        child.parentNode.replaceChild(fragment, child);
                    }
                }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                matches.push(...highlightText(child, queryRegexPattern, color, subjectId, highlightSettings, matchState));
            }
        }

        return matches;
    }

    function normalizeVn(str) {
        if (!str) return '';
        return str.toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/đ/g, "d");
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ======= Feature #16: Global Keyboard Navigation (Ctrl+Arrow) =======
    let globalNavIndex = -1;
    let globalNavElements = [];

    function buildGlobalNavList() {
        globalNavElements = [];
        Object.keys(subjectMatches).forEach(id => {
            const matchData = subjectMatches[id];
            if (matchData && matchData.elements) {
                matchData.elements.forEach(el => {
                    globalNavElements.push({ subjectId: id, element: el });
                });
            }
        });
        // Sort by vertical position on page
        globalNavElements.sort((a, b) => {
            const rectA = a.element.getBoundingClientRect();
            const rectB = b.element.getBoundingClientRect();
            return (rectA.top + window.scrollY) - (rectB.top + window.scrollY);
        });
    }

    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        
        buildGlobalNavList();
        if (globalNavElements.length === 0) return;
        
        e.preventDefault();
        
        // Clear all focus highlights
        Object.keys(subjectMatches).forEach(id => clearFocusHighlight(id));
        
        if (e.key === 'ArrowDown') {
            globalNavIndex = (globalNavIndex + 1) % globalNavElements.length;
        } else {
            globalNavIndex = (globalNavIndex - 1 + globalNavElements.length) % globalNavElements.length;
        }
        
        const target = globalNavElements[globalNavIndex];
        setFocusHighlight(target.subjectId, 
            subjectMatches[target.subjectId].elements.indexOf(target.element));
        target.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
}
