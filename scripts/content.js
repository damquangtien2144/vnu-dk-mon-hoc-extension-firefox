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
        @keyframes vnu-badge-pop {
            0% { transform: scale(0.5); opacity: 0; }
            60% { transform: scale(1.15); }
            100% { transform: scale(1); opacity: 1; }
        }
        .vnu-deep-reveal-outline {
            outline: 2px dashed #7c3aed !important;
            outline-offset: 3px !important;
            box-shadow: 0 0 20px rgba(124, 58, 237, 0.25) !important;
        }
    `;
    document.head.appendChild(style);

    // Biến lưu trữ trạng thái các kết quả tìm kiếm của từng môn học
    const subjectMatches = {};

    // Lắng nghe message từ Popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "HIGHLIGHT") {
            const { subjectId, queries, color, highlightSettings, scanMode } = request;
            
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
                const norm = normalizeVn(q).trim().substring(0, 100);
                return escapeRegExp(norm).replace(/\s+/g, '\\s{1,10}');
            });
            const regexQueries = regexPatterns.map(p => new RegExp(p, 'i'));

            const containers = findSmallestContainers(document.body, regexQueries);
            
            const validContainers = [];
            containers.forEach(container => {
                const wasHidden = isElementOrAncestorHidden(container);
                if (scanMode === 'normal' && wasHidden) return;
                
                validContainers.push(container);
                let matchedHighlights = 0;
                regexPatterns.forEach(pattern => {
                    const matches = highlightText(container, pattern, color, subjectId, highlightSettings, { count: 0, limit: 1 });
                    matchedHighlights += matches.length;
                });
                
                if (matchedHighlights === 0) {
                    container.classList.add('vnu-fallback-highlight');
                    container.dataset.subjectId = subjectId;
                    applyHighlightStyle(container, color, highlightSettings);
                }
            });

            // Thay vì lưu từng từ đơn, ta lưu toàn bộ container (dòng) để chuyển hướng
            subjectMatches[subjectId].elements = validContainers;

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
                const validContainers = [];
                
                containers.forEach(container => {
                    const wasHidden = isElementOrAncestorHidden(container);
                    if (subject.scanMode === 'normal' && wasHidden) return;
                    
                    validContainers.push(container);
                    let matchedHighlights = 0;
                    regexPatterns.forEach(pattern => {
                        const matches = highlightText(container, pattern, subject.color, subject.subjectId, highlightSettings, { count: 0, limit: 1 });
                        matchedHighlights += matches.length;
                    });
                    
                    if (matchedHighlights === 0) {
                        container.classList.add('vnu-fallback-highlight');
                        container.dataset.subjectId = subject.subjectId;
                        applyHighlightStyle(container, subject.color, highlightSettings);
                    }
                });
                
                subjectMatches[subject.subjectId].elements = validContainers;
                counts[subject.subjectId] = validContainers.length;
                
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
            marks.forEach(mark => {
                if (isBlinking) {
                    mark.classList.add('vnu-blink');
                } else {
                    mark.classList.remove('vnu-blink');
                }
            });
            sendResponse({ success: true });
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
                totalCount: matchData ? matchData.elements.length : 0,
                isCurrentHidden: matchData && matchData.hiddenFlags ? (matchData.hiddenFlags[matchData.currentIndex] || false) : false
            });
        }
        else if (request.action === "DEEP_SEARCH") {
            const { subjectId, queries, color, highlightSettings, scanMode } = request;
            
            removeOldHighlights(subjectId);
            restoreHiddenElements();
            
            subjectMatches[subjectId] = { currentIndex: 0, elements: [], hiddenFlags: [] };

            if (!queries || queries.length === 0) {
                sendResponse({ success: true, count: 0, hiddenCount: 0, currentIndex: 0 });
                return;
            }

            const regexPatterns = queries.map(q => {
                const norm = normalizeVn(q).trim();
                return escapeRegExp(norm).replace(/\s+/g, '\\s+');
            });
            const regexQueries = regexPatterns.map(p => new RegExp(p, 'i'));

            // Dùng deep search thay vì findSmallestContainers
            const containers = deepFindContainers(document.body, regexQueries);
            
            let hiddenCount = 0;
            const hiddenFlags = [];
            const validContainers = [];
            
            containers.forEach(container => {
                // Kiểm tra phần tử có đang bị ẩn không
                const wasHidden = isElementOrAncestorHidden(container);
                
                if (scanMode === 'normal' && wasHidden) return;

                hiddenFlags.push(wasHidden);
                validContainers.push(container);
                
                if (wasHidden) {
                    forceRevealElement(container);
                    addHiddenBadge(container);
                    container.classList.add('vnu-deep-reveal-outline');
                    hiddenCount++;
                }
                
                let matchedHighlights = 0;
                regexPatterns.forEach(pattern => {
                    const matches = highlightText(container, pattern, color, subjectId, highlightSettings, { count: 0, limit: 1 });
                    matchedHighlights += matches.length;
                });
                
                if (matchedHighlights === 0) {
                    container.classList.add('vnu-fallback-highlight');
                    container.dataset.subjectId = subjectId;
                    applyHighlightStyle(container, color, highlightSettings);
                }
            });

            subjectMatches[subjectId].elements = validContainers;
            subjectMatches[subjectId].hiddenFlags = hiddenFlags;

            if (subjectMatches[subjectId].elements.length > 0) {
                setFocusHighlight(subjectId, 0);
                subjectMatches[subjectId].elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            if (request.isBlinking) {
                const marks = document.querySelectorAll(`mark.vnu-extension-highlight[data-subject-id="${subjectId}"]`);
                marks.forEach(mark => mark.classList.add('vnu-blink'));
            }
            
            sendResponse({ 
                success: true, 
                count: subjectMatches[subjectId].elements.length,
                hiddenCount: hiddenCount,
                currentIndex: 0,
                isCurrentHidden: hiddenFlags.length > 0 ? hiddenFlags[0] : false
            });
        }
        else if (request.action === "SCAN_ALL") {
            const { subjects, highlightSettings } = request;
            
            removeOldHighlights();
            restoreHiddenElements();
            
            const counts = {};
            const hiddenCounts = {};
            const firstHiddenFlags = {};
            
            subjects.forEach(subject => {
                subjectMatches[subject.subjectId] = { currentIndex: 0, elements: [] };
                
                if (!subject.queries || subject.queries.length === 0) {
                    counts[subject.subjectId] = 0;
                    hiddenCounts[subject.subjectId] = 0;
                    firstHiddenFlags[subject.subjectId] = false;
                    return;
                }

                const regexPatterns = subject.queries.map(q => {
                    const norm = normalizeVn(q).trim();
                    return escapeRegExp(norm).replace(/\s+/g, '\\s+');
                });
                const regexQueries = regexPatterns.map(p => new RegExp(p, 'i'));

                const containers = (subject.scanMode === 'deep' || subject.scanMode === 'both') 
                    ? deepFindContainers(document.body, regexQueries)
                    : findSmallestContainers(document.body, regexQueries);
                
                let hiddenCount = 0;
                const hiddenFlags = [];
                const validContainers = [];
                
                containers.forEach(container => {
                    const wasHidden = isElementOrAncestorHidden(container);
                    
                    if (subject.scanMode === 'normal' && wasHidden) return;
                    
                    hiddenFlags.push(wasHidden);
                    validContainers.push(container);
                    
                    if (wasHidden) {
                        forceRevealElement(container);
                        addHiddenBadge(container);
                        container.classList.add('vnu-deep-reveal-outline');
                        hiddenCount++;
                    }
                    
                    let matchedHighlights = 0;
                    regexPatterns.forEach(pattern => {
                        const matches = highlightText(container, pattern, subject.color, subject.subjectId, highlightSettings, { count: 0, limit: 1 });
                        matchedHighlights += matches.length;
                    });
                    
                    if (matchedHighlights === 0) {
                        container.classList.add('vnu-fallback-highlight');
                        container.dataset.subjectId = subject.subjectId;
                        applyHighlightStyle(container, subject.color, highlightSettings);
                    }
                });
                
                subjectMatches[subject.subjectId].elements = validContainers;
                subjectMatches[subject.subjectId].hiddenFlags = hiddenFlags;
                counts[subject.subjectId] = validContainers.length;
                hiddenCounts[subject.subjectId] = hiddenCount;
                firstHiddenFlags[subject.subjectId] = hiddenFlags.length > 0 ? hiddenFlags[0] : false;
                
                if (subjectMatches[subject.subjectId].elements.length > 0) {
                    setFocusHighlight(subject.subjectId, 0);
                }

                if (subject.isBlinking) {
                    const marks = document.querySelectorAll(`mark.vnu-extension-highlight[data-subject-id="${subject.subjectId}"]`);
                    marks.forEach(mark => mark.classList.add('vnu-blink'));
                }
            });

            sendResponse({ success: true, counts: counts, hiddenCounts: hiddenCounts, firstHiddenFlags: firstHiddenFlags });
        }
        else if (request.action === "RESTORE_HIDDEN") {
            restoreHiddenElements();
            // Xóa outline class
            document.querySelectorAll('.vnu-deep-reveal-outline').forEach(el => {
                el.classList.remove('vnu-deep-reveal-outline');
            });
            sendResponse({ success: true });
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
        const isHidden = matchData.hiddenFlags && matchData.hiddenFlags[index];
        
        el.classList.add('vnu-highlight-focus');
        
        if (isHidden) {
            // Kết quả ẩn → viền tím nét đứt + glow tím
            el.style.outline = '3px dashed #7c3aed';
            el.style.outlineOffset = '2px';
            el.style.boxShadow = '0 0 20px rgba(124, 58, 237, 0.4)';
        } else {
            // Kết quả thường → viền đỏ nét đứt (giữ nguyên)
            el.style.outline = '3px dashed #ef4444';
            el.style.outlineOffset = '2px';
            el.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.4)';
        }
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

        const fallbackSelector = subjectId 
            ? `.vnu-fallback-highlight[data-subject-id="${subjectId}"]`
            : `.vnu-fallback-highlight`;
        document.querySelectorAll(fallbackSelector).forEach(el => {
            el.classList.remove('vnu-fallback-highlight');
            delete el.dataset.subjectId;
            el.style.backgroundColor = '';
            el.style.color = '';
            el.style.textDecoration = '';
            el.style.borderBottom = '';
            el.style.fontWeight = '';
            el.style.textShadow = '';
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
        if (event.origin !== window.location.origin) return;
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
            const invalidMultiRowTags = ['TBODY', 'TABLE', 'THEAD', 'TFOOT', 'UL', 'OL', 'DL', 'BODY', 'MAIN', 'ARTICLE', 'SECTION', 'FORM', 'ASIDE', 'NAV'];
            if (invalidMultiRowTags.includes(node.tagName)) {
                return containers;
            }

            if (node.tagName === 'TR' || node.tagName === 'LI' || node.textContent.trim().length <= 800) {
                containers.push(node);
            }
        }
        
        return containers;
    }

    // ======= DEEP SEARCH ENGINE =======
    // Lưu trữ các phần tử đã bị force reveal để phục hồi sau
    const revealedElements = new Map();

    // Kiểm tra phần tử có đang bị ẩn không
    function isElementHidden(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
        if (el.tagName === 'DETAILS' && !el.open) return true;
        try {
            const style = window.getComputedStyle(el);
            if (style.display === 'none') return true;
            if (style.visibility === 'hidden' || style.visibility === 'collapse') return true;
            if (style.contentVisibility === 'hidden') return true;
            if (parseFloat(style.opacity) === 0) return true;
            if (style.clip === 'rect(0px, 0px, 0px, 0px)') return true;
            if (style.clipPath === 'inset(100%)') return true;
            if (style.transform && style.transform !== 'none') {
                const matrixMatch = style.transform.match(/matrix\((.+)\)/);
                if (matrixMatch) {
                    const parts = matrixMatch[1].split(',').map(p => parseFloat(p.trim()));
                    if (parts.length === 6) {
                        // parts[0] is scaleX, parts[3] is scaleY
                        if (Math.abs(parts[0]) < 0.001 || Math.abs(parts[3]) < 0.001) return true;
                        // parts[4] is translateX, parts[5] is translateY
                        if (parts[4] < -9000 || parts[5] < -9000) return true;
                    }
                }
            }
            // Kiểm tra kích thước = 0 (khi overflow bị hidden)
            if ((el.offsetWidth === 0 || el.offsetHeight === 0) && style.overflow === 'hidden') return true;
            // Kiểm tra css height/maxHeight = 0
            if ((style.height === '0px' || style.maxHeight === '0px') && style.overflow === 'hidden') return true;
            // Kiểm tra nằm ngoài viewport cực xa (trick ẩn bằng position) hoặc off-canvas
            const rect = el.getBoundingClientRect();
            if (rect.right < -9000 || rect.bottom < -9000) return true;
            
            if (style.position === 'fixed' || style.position === 'absolute') {
                // Nếu element fixed/absolute bị đẩy hoàn toàn ra khỏi màn hình (như Canvas LMS drawer)
                if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) {
                    return true;
                }
            }
        } catch (e) {
            return false;
        }
        return false;
    }

    // Kiểm tra phần tử hoặc bất kỳ ancestor nào bị ẩn
    function isElementOrAncestorHidden(el) {
        let current = el;
        while (current && current !== document.body && current !== document.documentElement) {
            if (isElementHidden(current)) return true;
            current = current.parentElement;
        }
        return false;
    }

    // Force hiển thị phần tử và tất cả ancestor bị ẩn
    function forceRevealElement(el) {
        let current = el;
        const revealed = [];
        while (current && current !== document.body && current !== document.documentElement) {
            if (isElementHidden(current)) {
                // Lưu CSS gốc
                const originalStyles = {
                    display: current.style.display,
                    visibility: current.style.visibility,
                    contentVisibility: current.style.contentVisibility,
                    opacity: current.style.opacity,
                    clip: current.style.clip,
                    clipPath: current.style.clipPath,
                    overflow: current.style.overflow,
                    height: current.style.height,
                    maxHeight: current.style.maxHeight,
                    width: current.style.width,
                    maxWidth: current.style.maxWidth,
                    transform: current.style.transform,
                    position: current.style.position,
                    left: current.style.left,
                    top: current.style.top,
                    right: current.style.right,
                    bottom: current.style.bottom,
                    margin: current.style.margin,
                    zIndex: current.style.zIndex
                };
                
                if (!revealedElements.has(current)) {
                    revealedElements.set(current, originalStyles);
                }

                // Nếu là thẻ details thì mở ra
                if (current.tagName === 'DETAILS' && !current.open) {
                    current.open = true;
                    // Ta cũng có thể lưu trạng thái open ban đầu vào map nếu muốn hoàn hảo hơn, 
                    // nhưng với CSS thì tạm thời cứ mở ra là được.
                    originalStyles.wasDetailsClosed = true;
                }

                // Force hiển thị
                const computed = window.getComputedStyle(current);
                if (computed.display === 'none') {
                    current.style.setProperty('display', 'block', 'important');
                }
                if (computed.visibility === 'hidden' || computed.visibility === 'collapse') {
                    current.style.setProperty('visibility', 'visible', 'important');
                }
                if (computed.contentVisibility === 'hidden') {
                    current.style.setProperty('content-visibility', 'visible', 'important');
                }
                if (parseFloat(computed.opacity) === 0) {
                    current.style.setProperty('opacity', '1', 'important');
                }
                if (computed.clip === 'rect(0px, 0px, 0px, 0px)') {
                    current.style.setProperty('clip', 'auto', 'important');
                }
                if (computed.clipPath === 'inset(100%)') {
                    current.style.setProperty('clip-path', 'none', 'important');
                }
                if (computed.transform && computed.transform !== 'none') {
                    current.style.setProperty('transform', 'none', 'important');
                }
                if (computed.overflow === 'hidden') {
                    if (current.offsetWidth === 0 || computed.width === '0px') current.style.setProperty('width', 'auto', 'important');
                    if (current.offsetHeight === 0 || computed.height === '0px') current.style.setProperty('height', 'auto', 'important');
                    if (computed.maxHeight === '0px') current.style.setProperty('max-height', 'none', 'important');
                    if (computed.maxWidth === '0px') current.style.setProperty('max-width', 'none', 'important');
                    current.style.setProperty('overflow', 'visible', 'important');
                }
                // Fix position ẩn ngoài viewport
                const rect = current.getBoundingClientRect();
                if (rect.right < -9000 || rect.bottom < -9000) {
                    current.style.setProperty('position', 'static', 'important');
                }
                
                // Nếu bị đẩy hoàn toàn ra ngoài (off-canvas)
                if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) {
                    current.style.setProperty('left', '0', 'important');
                    current.style.setProperty('top', '0', 'important');
                    current.style.setProperty('right', 'auto', 'important');
                    current.style.setProperty('bottom', 'auto', 'important');
                    current.style.setProperty('margin', '0', 'important');
                    current.style.setProperty('transform', 'none', 'important');
                    current.style.setProperty('z-index', '999999', 'important');
                }

                revealed.push(current);
            }
            current = current.parentElement;
        }
        return revealed;
    }

    // Phục hồi tất cả phần tử đã bị force reveal
    function restoreHiddenElements() {
        revealedElements.forEach((originalStyles, el) => {
            try {
                Object.keys(originalStyles).forEach(prop => {
                    if (prop === 'wasDetailsClosed') {
                        el.open = false;
                    } else {
                        el.style[prop] = originalStyles[prop];
                    }
                });
                // Xóa badge ẩn nếu có
                const badges = el.querySelectorAll('.vnu-hidden-badge');
                badges.forEach(b => b.remove());
            } catch (e) {
                // Element có thể đã bị xóa khỏi DOM
            }
        });
        revealedElements.clear();
    }

    // Thêm badge "🔍 Ẩn" cho container chứa kết quả ẩn
    function addHiddenBadge(container) {
        if (container.querySelector('.vnu-hidden-badge')) return;
        const badge = document.createElement('span');
        badge.className = 'vnu-hidden-badge';
        badge.textContent = '🔍 Ẩn';
        badge.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 2px;
            background: linear-gradient(135deg, #7c3aed, #ec4899);
            color: white;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 10px;
            margin-left: 6px;
            vertical-align: middle;
            box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4);
            animation: vnu-badge-pop 0.3s ease;
            pointer-events: none;
        `;
        container.insertBefore(badge, container.firstChild);
    }

    // Deep Search: Tìm containers kể cả phần tử ẩn + Shadow DOM + iframes
    function deepFindContainers(rootNode, regexQueries, depth = 0) {
        const containers = [];
        if (!rootNode || depth > 20) return containers; // Giới hạn depth cho iframe/shadow root nesting

        // 1. Tìm kết quả trong Light DOM của rootNode hiện tại
        // Đảm bảo Quét Sâu tìm được TẤT CẢ những gì Quét Thường tìm được
        containers.push(...findSmallestContainers(rootNode, regexQueries));
        
        // 2. Tìm tất cả shadowRoot và iframes bên trong rootNode này để đào sâu thêm
        if (rootNode.querySelectorAll) {
            // Bao gồm cả rootNode và các descendants (nhưng querySelectorAll không xuyên qua shadow root)
            const allElements = [rootNode, ...rootNode.querySelectorAll('*')];
            for (let el of allElements) {
                // Duyệt Shadow DOM
                if (el.shadowRoot) {
                    containers.push(...deepFindContainers(el.shadowRoot, regexQueries, depth + 1));
                }
                // Duyệt Iframe
                if (el.tagName === 'IFRAME') {
                    try {
                        const iframeDoc = el.contentDocument || el.contentWindow?.document;
                        if (iframeDoc && iframeDoc.body) {
                            containers.push(...deepFindContainers(iframeDoc.body, regexQueries, depth + 1));
                        }
                    } catch (e) {
                        // Bỏ qua lỗi cross-origin iframe
                    }
                }
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
                    const { text: normText, map: indexMap } = normalizeWithMap(originalText);
                    
                    regex.lastIndex = 0;
                    if (!regex.test(normText)) continue;
                    
                    const fragment = document.createDocumentFragment();
                    let lastOrigIdx = 0;
                    
                    regex.lastIndex = 0; // Reset lại sau regex.test()
                    let match;

                    while ((match = regex.exec(normText)) !== null) {
                        if (matchState && matchState.count >= matchState.limit) break;

                        // Map index từ text chuẩn hóa về text gốc
                        const origMatchStart = indexMap[match.index];
                        const origMatchEnd = indexMap[match.index + match[0].length];

                        const before = originalText.substring(lastOrigIdx, origMatchStart);
                        if (before.length > 0) {
                            fragment.appendChild(document.createTextNode(before));
                        }

                        const mark = document.createElement('mark');
                        mark.className = 'vnu-extension-highlight';
                        mark.dataset.subjectId = subjectId;
                        mark.style.borderRadius = '2px';
                        mark.style.padding = '0 2px';
                        mark.style.transition = 'all 0.2s ease';
                        
                        // Lấy text gốc để wrap, dựa trên index map chính xác
                        mark.textContent = originalText.substring(origMatchStart, origMatchEnd);
                        
                        // Feature #14: Áp dụng highlight style
                        applyHighlightStyle(mark, color, highlightSettings);
                        
                        fragment.appendChild(mark);
                        matches.push(mark);

                        if (matchState) matchState.count++;

                        lastOrigIdx = origMatchEnd;
                    }

                    const after = originalText.substring(lastOrigIdx);
                    if (after.length > 0) {
                        fragment.appendChild(document.createTextNode(after));
                    }

                    if (lastOrigIdx > 0) {
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

    // Chuẩn hóa text và tạo bản đồ index: normIndex → origIndex
    // Dùng để map vị trí match từ text chuẩn hóa về text gốc (hỗ trợ dấu tiếng Việt)
    function normalizeWithMap(str) {
        if (!str) return { text: '', map: [0] };
        const lower = str.toLowerCase();
        let normalized = '';
        const map = []; // map[normalizedIndex] = originalIndex

        for (let i = 0; i < lower.length; i++) {
            const ch = lower[i];
            if (ch === 'đ') {
                map.push(i);
                normalized += 'd';
            } else {
                const decomposed = ch.normalize("NFD");
                for (let j = 0; j < decomposed.length; j++) {
                    const code = decomposed.charCodeAt(j);
                    if (code >= 0x0300 && code <= 0x036f) {
                        continue; // Bỏ qua combining mark
                    }
                    map.push(i);
                    normalized += decomposed[j];
                }
            }
        }
        map.push(str.length); // Sentinel cho substring ở cuối
        return { text: normalized, map };
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
