// app.js - All API calls and chat logic

let queryHistory = JSON.parse(localStorage.getItem('nvh_history') || '[]');

// Load health status on startup
async function loadHealth() {
    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/health`);
        const data = await res.json();

        document.getElementById('status-badge').textContent = 'System online';
        document.getElementById('doc-count').textContent =
            `${data.indexed_documents.length} documents indexed`;
        document.getElementById('total-chunks').textContent = data.total_chunks;
        document.getElementById('total-docs').textContent =
            data.indexed_documents.length;

        renderDocumentList(data.indexed_documents, data.chunk_type_counts);
    } catch (err) {
        document.getElementById('status-badge').textContent = 'Offline';
        document.getElementById('status-badge').style.color = 'var(--color-text-danger)';
    }
}

// Render indexed document list in sidebar
function renderDocumentList(docs, counts) {
    const container = document.getElementById('doc-list');
    if (docs.length === 0) {
        container.innerHTML = '<p style="font-size:12px;color:var(--color-text-secondary)">No documents indexed yet</p>';
        return;
    }
    container.innerHTML = docs.map(doc => `
        <div style="padding:8px 10px;border-radius:8px;border:0.5px solid var(--color-border-tertiary);background:var(--color-background-secondary);margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:12px;font-weight:500;color:var(--color-text-primary)">${doc}</span>
            </div>
        </div>
    `).join('');
}

// Upload PDF
async function uploadPDF(file) {
    const formData = new FormData();
    formData.append('file', file);

    showUploadStatus('Uploading and processing...', 'info');

    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/ingest`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (res.ok) {
            showUploadStatus(
                `Done! ${data.chunks_added} chunks added in ${data.processing_time_seconds}s`,
                'success'
            );
            loadHealth(); // Refresh stats
        } else {
            showUploadStatus(`Error: ${data.detail}`, 'error');
        }
    } catch (err) {
        showUploadStatus('Upload failed — is the backend running?', 'error');
    }
}

function showUploadStatus(msg, type) {
    const el = document.getElementById('upload-status');
    el.textContent = msg;
    el.style.color = type === 'success'
        ? 'var(--color-text-success)'
        : type === 'error'
        ? 'var(--color-text-danger)'
        : 'var(--color-text-secondary)';
}

// Send query
async function sendQuery() {
    const input = document.getElementById('query-input');
    const question = input.value.trim();
    if (!question) return;

    input.value = '';
    appendMessage('user', question);
    appendMessage('assistant', '...', true); // loading

    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, top_k: 5 })
        });
        const data = await res.json();

        removeLoading();

        if (res.ok) {
            appendMessage('assistant', data.answer, false, data.sources);
            saveToHistory(question, data.answer, data.sources);
        } else {
            appendMessage('assistant', `Error: ${data.detail}`);
        }
    } catch (err) {
        removeLoading();
        appendMessage('assistant', 'Could not reach backend. Is the server running?');
    }
}

// Append message to chat
function appendMessage(role, text, isLoading = false, sources = []) {
    const chat = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = isLoading ? 'loading-msg' : '';
    div.style.display = 'flex';
    div.style.flexDirection = role === 'user' ? 'row-reverse' : 'column';
    div.style.gap = '6px';
    div.style.marginBottom = '16px';

    const bubble = document.createElement('div');
    bubble.style.cssText = role === 'user'
        ? 'background:#1D9E75;color:#fff;border-radius:12px 12px 2px 12px;padding:10px 14px;font-size:13px;max-width:70%;line-height:1.5'
        : 'background:var(--color-background-secondary);border:0.5px solid var(--color-border-tertiary);border-radius:2px 12px 12px 12px;padding:12px 14px;font-size:13px;color:var(--color-text-primary);max-width:85%;line-height:1.5';

    bubble.textContent = text;
    div.appendChild(bubble);

    // Source pills
    if (sources.length > 0) {
        const pills = document.createElement('div');
        pills.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding-left:2px';
        sources.forEach(s => {
            const pill = document.createElement('span');
            pill.style.cssText = 'font-size:11px;padding:3px 8px;border-radius:99px;background:var(--color-background-info);color:var(--color-text-info);border:0.5px solid var(--color-border-info)';
            pill.textContent = `${s.filename} · p${s.page_number} · ${s.chunk_type} · ${s.relevance_score.toFixed(2)}`;
            pills.appendChild(pill);
        });
        div.appendChild(pills);
    }

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function removeLoading() {
    const el = document.querySelector('.loading-msg');
    if (el) el.remove();
}

// Save to history
function saveToHistory(question, answer, sources) {
    queryHistory.unshift({
        question,
        answer,
        sources,
        timestamp: new Date().toLocaleString()
    });
    queryHistory = queryHistory.slice(0, 50); // Keep last 50
    localStorage.setItem('nvh_history', JSON.stringify(queryHistory));
    renderHistory();
}

// Render history panel
function renderHistory() {
    const container = document.getElementById('history-list');
    if (queryHistory.length === 0) {
        container.innerHTML = '<p style="font-size:12px;color:var(--color-text-secondary)">No history yet</p>';
        return;
    }
    container.innerHTML = queryHistory.slice(0, 10).map((item, i) => `
        <div onclick="replayQuery(${i})"
             style="padding:8px 10px;border-radius:8px;border:0.5px solid var(--color-border-tertiary);
                    background:var(--color-background-secondary);margin-bottom:6px;cursor:pointer">
            <p style="font-size:12px;font-weight:500;color:var(--color-text-primary);margin:0 0 2px;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.question}</p>
            <p style="font-size:11px;color:var(--color-text-secondary);margin:0">${item.timestamp}</p>
        </div>
    `).join('');
}

function replayQuery(index) {
    const item = queryHistory[index];
    document.getElementById('query-input').value = item.question;
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadHealth();
    renderHistory();

    // File upload
    document.getElementById('file-input').addEventListener('change', e => {
        if (e.target.files[0]) uploadPDF(e.target.files[0]);
    });

    // Drop zone
    const dropzone = document.getElementById('dropzone');
    dropzone.addEventListener('dragover', e => {
        e.preventDefault();
        dropzone.style.borderColor = '#1D9E75';
    });
    dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'var(--color-border-secondary)';
    });
    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--color-border-secondary)';
        if (e.dataTransfer.files[0]) uploadPDF(e.dataTransfer.files[0]);
    });

    // Send on Enter
    document.getElementById('query-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendQuery();
        }
    });
});