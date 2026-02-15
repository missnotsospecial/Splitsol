// ==========================================
// 1. GLOBAL CONFIGURATION & STATE
// ==========================================
console.log('🚀 SplitSol App Loading...');

// Update this to match your Solana Playground "Build & Deploy" tab
const PROGRAM_ID = new solanaWeb3.PublicKey("HU4wkHJ97BBeabrchh94ZvMPViJrh8dCZfA3K5Cz1qbY");

let idl = null;
let program = null;
let currentReference = null;
let paymentCheckInterval = null;

const state = {
    wallet: null,
    selectedGroup: null,
    groups: [],
    payments: [],
    stats: { totalGroups: 0, pendingPayments: 0, settledPayments: 0 }
};

// ==========================================
// 2. SOLANA PAY (QR CODE) LOGIC
// ==========================================

async function generatePaymentQR(recipientAddress, lamports, note, memberIndex, expensePDA, groupPDA) {
    // 1. Convert lamports to SOL units for the URL
    const solAmount = (lamports / 1000000000).toFixed(9).replace(/\.?0+$/, "");
    
    // 2. Create a unique Reference Key to "listen" for this specific transaction
    const reference = solanaWeb3.Keypair.generate().publicKey;
    currentReference = reference.toBase58();

    // 3. Build the Solana Pay URL (This opens Phantom Mobile automatically)
    const label = encodeURIComponent("SplitSol");
    const message = encodeURIComponent(note);
    const solanaPayUrl = `solana:${recipientAddress}?amount=${solAmount}&reference=${currentReference}&label=${label}&message=${message}`;

    // 4. Render QR to the UI
    const qrContainer = document.getElementById('qrcode');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, { text: solanaPayUrl, width: 256, height: 256 });
        console.log("📲 QR Generated for reference:", currentReference);
    }

    // 5. Start watching the blockchain for the SOL to arrive
    startListeningForPayment(reference, memberIndex, expensePDA, groupPDA, recipientAddress);
}

async function startListeningForPayment(reference, memberIndex, expensePDA, groupPDA, payerWallet) {
    if (paymentCheckInterval) clearInterval(paymentCheckInterval);
    
    const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl("devnet"), "confirmed");
    showToast("Waiting for friend to scan...", "info");

    paymentCheckInterval = setInterval(async () => {
        const signatures = await connection.getSignaturesForAddress(reference, { limit: 1 });
        
        if (signatures.length > 0) {
            clearInterval(paymentCheckInterval);
            showToast("SOL Received! Marking as paid on-chain...", "success");
            
            // Bridge: Automatically call the Rust program once SOL moves
            await payFriendOnChain(memberIndex, expensePDA, groupPDA, payerWallet);
        }
    }, 3000);
}

// ==========================================
// 3. ANCHOR / SMART CONTRACT LOGIC
// ==========================================

async function initSplitSol() {
    try {
        const response = await fetch('./idl.json');
        idl = await response.json();
        const provider = getProvider(); 
        if (provider) {
            program = new anchor.Program(idl, PROGRAM_ID, provider);
            console.log("✅ Program Initialized");
        }
    } catch (err) {
        console.error("❌ Failed to load IDL:", err);
    }
}

async function payFriendOnChain(memberIndex, expensePDA, groupPDA, payerWallet) {
    if (!program) return showToast("Connect wallet first", "warning");
    
    showLoading("Updating Blockchain Record...");
    try {
        const tx = await program.methods
            .payExpense(memberIndex)
            .accounts({
                expense: new solanaWeb3.PublicKey(expensePDA),
                group: new solanaWeb3.PublicKey(groupPDA),
                member: window.solana.publicKey,
                payer: new solanaWeb3.PublicKey(payerWallet),
                systemProgram: solanaWeb3.SystemProgram.programId,
            })
            .rpc();

        showToast("Success! Transaction Recorded.", "success");
        console.log("Signature:", tx);
        loadPaymentHistory(); 
    } catch (err) {
        console.error("Payment Error:", err);
        showToast("Failed to finalize on-chain", "danger");
    } finally {
        hideLoading();
    }
}

// ==========================================
// 4. WALLET & UTILS
// ==========================================

function getProvider() {
    if (!window.solana) return null;
    const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl("devnet"), "confirmed");
    return new anchor.AnchorProvider(connection, window.solana, { preflightCommitment: "processed" });
}

async function connectWallet() {
    try {
        if (!window.solana?.isPhantom) {
            showToast('Install Phantom!', 'error');
            return;
        }
        const response = await window.solana.connect();
        state.wallet = window.solana;
        const pub = response.publicKey.toString();
        document.getElementById('connect-wallet').style.display = 'none';
        document.getElementById('wallet-connected').style.display = 'flex';
        document.querySelector('.wallet-address').textContent = `${pub.slice(0,4)}...${pub.slice(-4)}`;
        showToast('Connected!', 'success');
        initSplitSol();
    } catch (e) { console.error(e); }
}

// ==========================================
// 5. NAVIGATION & UI HANDLING
// ==========================================

window.navigateToScreen = function(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        if (screenId === 'history') loadPaymentHistory();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Event Delegation for buttons
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        if (btn.classList.contains('menu-btn')) navigateToScreen(btn.dataset.screen);
        if (btn.classList.contains('back-btn')) navigateToScreen('dashboard');
        if (btn.id === 'connect-wallet') connectWallet();
        if (btn.id === 'add-friend-btn') addFriendInput();
    });

    loadMockData();
});

// ==========================================
// 6. MOCK DATA & UI HELPERS
// ==========================================

function loadMockData() {
    state.groups = [{ id: '1', name: 'Weekend Trip', members: ['You', 'Alice', 'Bob'] }];
    state.payments = [{ id: '1', groupName: 'Weekend Trip', description: 'Hotel', amount: 2.5, settled: false, timestamp: new Date().toISOString() }];
    updateStatsUI();
}

function updateStatsUI() {
    document.getElementById('total-groups').textContent = state.groups.length;
    document.getElementById('pending-payments').textContent = state.payments.filter(p => !p.settled).length;
    document.getElementById('settled-payments').textContent = state.payments.filter(p => p.settled).length;
}

function showToast(m, type) {
    const t = document.getElementById('toast');
    t.textContent = m;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3000);
}

function showLoading(msg) {
    const l = document.getElementById('loading-overlay');
    l.querySelector('.loading-text').textContent = msg;
    l.style.display = 'flex';
}

function hideLoading() { document.getElementById('loading-overlay').style.display = 'none'; }

function addFriendInput() {
    const div = document.createElement('div');
    div.className = 'friend-input-row';
    div.innerHTML = `<input type="text" class="form-input friend-address" placeholder="Friend Address" required>
                     <button type="button" class="remove-friend-btn">×</button>`;
    document.getElementById('friends-list').appendChild(div);
}
function loadPaymentHistory() {
    const container = document.getElementById('payments-list');
    container.innerHTML = '';

    state.payments.forEach(payment => {
        const div = document.createElement('div');
        div.className = `payment-card ${payment.settled ? 'settled' : 'pending'}`;
        
        // Example: Only show the "Pay" button if it's not settled
        const actionButton = !payment.settled ? 
            `<button class="pay-now-btn" onclick="triggerPaymentFlow('${payment.id}')">Pay SOL</button>` : 
            `<span class="status-badge">Settled</span>`;

        div.innerHTML = `
            <div class="payment-info">
                <strong>${payment.description}</strong>
                <span>${payment.amount} SOL</span>
            </div>
            ${actionButton}
        `;
        container.appendChild(div);
    });
}

// This helper links your UI state to the QR generator
async function triggerPaymentFlow(paymentId) {
    const payment = state.payments.find(p => p.id === paymentId);
    if (!payment) return;

    // 1. Convert SOL back to Lamports for the Smart Contract
    const lamports = payment.amount * 1000000000;
    
    // 2. You'll need the actual PDA addresses from your state
    // In a real app, these are stored when the expense is created
    const recipient = payment.recipientAddress || "RECIPIENT_PUBKEY_HERE";
    const memberIndex = payment.memberIndex || 0; 
    const expensePDA = payment.expensePDA || "EXPENSE_PDA_HERE";
    const groupPDA = payment.groupPDA || "GROUP_PDA_HERE";

    generatePaymentQR(recipient, lamports, payment.description, memberIndex, expensePDA, groupPDA);
    
    // Switch to a screen that shows the 'qrcode' div
    navigateToScreen('qr-screen'); 
}

console.log('✅ App ready!');
