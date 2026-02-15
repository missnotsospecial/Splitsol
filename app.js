// ============================
// Simple, Working Navigation
// ============================

console.log('🚀 App loading...');
// Replace with the actual Program ID from your Solana Playground Build/Deploy tab
const PROGRAM_ID = new solanaWeb3.PublicKey("HU4wkHJ97BBeabrchh94ZvMPViJrh8dCZfA3K5Cz1qbY"); 

let idl = null;
let program = null;

// This function loads your dictionary file and prepares the "Program" object
async function initSplitSol() {
    try {
        const response = await fetch('./idl.json');
        idl = await response.json();
        
        const provider = await getProvider(); // Assuming your existing wallet provider helper
        program = new anchor.Program(idl, PROGRAM_ID, provider);
        
        console.log("✅ SplitSol Program Initialized");
    } catch (err) {
        console.error("❌ Failed to load IDL:", err);
    }
}

// Call this immediately
initSplitSol();
// Global navigation function
window.navigateToScreen = function(screenId) {
    console.log('📍 Navigating to:', screenId);
    
    // Hide all screens
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show target screen
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        window.scrollTo(0, 0);
        
        // Special handling
        if (screenId === 'history') {
            setTimeout(loadPaymentHistory, 100);
        }
    } else {
        console.error('❌ Screen not found:', screenId);
    }
};

// Wait for DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM Ready - Initializing...');
    
    // Use event delegation on document body for ALL clicks
    document.body.addEventListener('click', function(e) {
        const target = e.target;
        const button = target.closest('button');
        
        if (!button) return;
        
        // Menu buttons
        if (button.classList.contains('menu-btn')) {
            const screenId = button.getAttribute('data-screen');
            console.log('🔘 Menu button clicked:', screenId);
            if (screenId) {
                navigateToScreen(screenId);
            }
        }
        
        // Back buttons
        if (button.classList.contains('back-btn')) {
            console.log('⬅️ Back button clicked');
            navigateToScreen('dashboard');
        }
        
        // Option buttons
        if (button.classList.contains('option-btn')) {
            const action = button.getAttribute('data-action');
            console.log('⚡ Option button clicked:', action);
            if (action === 'create-group') {
                navigateToScreen('create-group');
            } else if (action === 'use-existing') {
                loadExistingGroups();
                navigateToScreen('use-existing');
            }
        }
        
        // Add friend button
        if (button.id === 'add-friend-btn') {
            addFriendInput();
        }
        
        // Start scan button
        if (button.id === 'start-scan-btn') {
            startQRScanner();
        }
        
        // Remove friend buttons
        if (button.classList.contains('remove-friend-btn')) {
            button.closest('.friend-input-row').remove();
        }
        
        // Connect/disconnect wallet
        if (button.id === 'connect-wallet') {
            connectWallet();
        }
        if (button.id === 'disconnect-wallet') {
            disconnectWallet();
        }
    });
    
    // Form submissions
    const groupForm = document.getElementById('group-form');
    if (groupForm) {
        groupForm.onsubmit = handleCreateGroup;
    }
    
    const expenseForm = document.getElementById('expense-form');
    if (expenseForm) {
        expenseForm.onsubmit = handleCreateExpense;
    }
    
    // Radio button changes
    const splitRadios = document.querySelectorAll('input[name="split-type"]');
    splitRadios.forEach(radio => {
        radio.onchange = handleSplitTypeChange;
    });
    
    // Load mock data
    loadMockData();
    
    console.log('✅ App initialized successfully!');
});

// ============================
// State
// ============================

const state = {
    wallet: null,
    selectedGroup: null,
    groups: [],
    payments: [],
    stats: { totalGroups: 0, pendingPayments: 0, settledPayments: 0 }
};

// ============================
// Wallet Functions
// ============================

async function connectWallet() {
    try {
        if (!window.solana || !window.solana.isPhantom) {
            showToast('Please install Phantom wallet!', 'error');
            window.open('https://phantom.app/', '_blank');
            return;
        }

        showLoading('Connecting wallet...');
        const response = await window.solana.connect();
        const publicKey = response.publicKey.toString();
        state.wallet = window.solana;
        
        const shortAddress = `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
        document.getElementById('connect-wallet').style.display = 'none';
        document.getElementById('wallet-connected').style.display = 'flex';
        document.querySelector('.wallet-address').textContent = shortAddress;
        
        hideLoading();
        showToast('Wallet connected!', 'success');
    } catch (error) {
        console.error('Wallet error:', error);
        hideLoading();
        showToast('Failed to connect wallet', 'error');
    }
}

function disconnectWallet() {
    if (state.wallet) {
        state.wallet.disconnect();
        state.wallet = null;
    }
    document.getElementById('connect-wallet').style.display = 'flex';
    document.getElementById('wallet-connected').style.display = 'none';
    showToast('Wallet disconnected', 'success');
}

// ============================
// Friend Input Management
// ============================

function addFriendInput() {
    const friendsList = document.getElementById('friends-list');
    const newRow = document.createElement('div');
    newRow.className = 'friend-input-row';
    newRow.innerHTML = `
        <input type="text" class="form-input friend-address" placeholder="Friend's wallet address" required>
        <button type="button" class="remove-friend-btn" style="display: flex;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        </button>
    `;
    friendsList.appendChild(newRow);
}

// ============================
// Group Functions
// ============================

async function handleCreateGroup(e) {
    e.preventDefault();
    
    if (!state.wallet) {
        showToast('Please connect your wallet first', 'warning');
        return;
    }
    
    const groupName = document.getElementById('group-name').value.trim();
    const friendAddresses = Array.from(document.querySelectorAll('.friend-address'))
        .map(input => input.value.trim())
        .filter(addr => addr.length > 0);
    
    if (friendAddresses.length === 0) {
        showToast('Please add at least one friend', 'warning');
        return;
    }
    
    showLoading('Creating group...');
    
    setTimeout(() => {
        const newGroup = {
            id: Date.now().toString(),
            name: groupName,
            members: ['You', ...friendAddresses],
            createdAt: new Date().toISOString()
        };
        
        state.groups.push(newGroup);
        state.stats.totalGroups++;
        updateStatsUI();
        
        hideLoading();
        showToast('Group created successfully!', 'success');
        document.getElementById('group-form').reset();
        navigateToScreen('dashboard');
    }, 1000);
}

function loadExistingGroups() {
    const container = document.getElementById('groups-container');
    container.innerHTML = '';
    
    if (state.groups.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                </svg>
                <p>No groups yet</p>
                <p class="empty-desc">Create your first group to get started</p>
            </div>
        `;
        return;
    }
    
    state.groups.forEach(group => {
        const card = document.createElement('div');
        card.className = 'group-card';
        card.innerHTML = `
            <div class="group-info">
                <div class="group-name">${group.name}</div>
                <div class="group-members">${group.members.length} members</div>
            </div>
            <div class="group-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="white" stroke-width="2"/>
                    <circle cx="9" cy="7" r="4" stroke="white" stroke-width="2"/>
                </svg>
            </div>
        `;
        
        card.onclick = function() {
            state.selectedGroup = group;
            showExpenseDetails(group);
        };
        
        container.appendChild(card);
    });
}

function showExpenseDetails(group) {
    const infoCard = document.getElementById('selected-group-info');
    infoCard.innerHTML = `
        <div class="card-title">Selected Group</div>
        <div style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">${group.name}</div>
        <div style="font-size: 0.9rem; color: #666;">${group.members.length} members</div>
    `;
    navigateToScreen('expense-details');
}

// ============================
// Expense Functions
// ============================

function handleSplitTypeChange(e) {
    const customContainer = document.getElementById('custom-split-container');
    if (e.target.value === 'custom') {
        customContainer.style.display = 'block';
        generateCustomSplitInputs();
    } else {
        customContainer.style.display = 'none';
    }
}

function generateCustomSplitInputs() {
    if (!state.selectedGroup) return;
    
    const container = document.getElementById('custom-split-container');
    container.innerHTML = '<div class="form-label" style="margin-top: 1rem;">Custom Amounts</div>';
    
    state.selectedGroup.members.forEach(member => {
        const inputGroup = document.createElement('div');
        inputGroup.className = 'form-group';
        inputGroup.innerHTML = `
            <label class="form-label" style="font-size: 0.85rem;">${member}</label>
            <input type="number" class="form-input custom-amount" placeholder="0.00" step="0.01" min="0" required>
        `;
        container.appendChild(inputGroup);
    });
}

async function handleCreateExpense(e) {
    e.preventDefault();
    
    if (!state.wallet) {
        showToast('Please connect your wallet first', 'warning');
        return;
    }
    
    if (!state.selectedGroup) {
        showToast('Please select a group first', 'warning');
        return;
    }
    
    const description = document.getElementById('description').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    
    showLoading('Creating payment...');
    
    setTimeout(() => {
        const newPayment = {
            id: Date.now().toString(),
            groupId: state.selectedGroup.id,
            groupName: state.selectedGroup.name,
            description,
            amount,
            settled: false,
            timestamp: new Date().toISOString()
        };
        
        state.payments.push(newPayment);
        state.stats.pendingPayments++;
        updateStatsUI();
        
        hideLoading();
        showToast('Payment created!', 'success');
        document.getElementById('expense-form').reset();
        state.selectedGroup = null;
        navigateToScreen('dashboard');
    }, 1000);
}

// ============================
// Payment History
// ============================

function loadPaymentHistory() {
    const container = document.getElementById('payments-list');
    container.innerHTML = '';
    
    if (state.payments.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                    <path d="M9 11L12 14L22 4" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                </svg>
                <p>No payment history</p>
                <p class="empty-desc">Your transactions will appear here</p>
            </div>
        `;
        return;
    }
    
    state.payments.forEach(payment => {
        const card = document.createElement('div');
        card.className = `payment-card ${payment.settled ? 'settled' : 'pending'}`;
        
        const date = new Date(payment.timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        card.innerHTML = `
            <div class="payment-header">
                <div>
                    <div class="payment-desc">${payment.description}</div>
                    <div class="payment-meta">
                        <span>${payment.groupName}</span>
                        <span>•</span>
                        <span>${date}</span>
                    </div>
                </div>
                <div>
                    <div class="payment-amount">${payment.amount.toFixed(2)} SOL</div>
                    <span class="payment-status ${payment.settled ? 'settled' : 'pending'}">
                        ${payment.settled ? 'Settled' : 'Pending'}
                    </span>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

// ============================
// Mock Data
// ============================

function loadMockData() {
    state.groups = [
        {
            id: '1',
            name: 'Weekend Trip',
            members: ['You', 'Alice', 'Bob'],
            createdAt: new Date().toISOString()
        },
        {
            id: '2',
            name: 'Roommates',
            members: ['You', 'Charlie'],
            createdAt: new Date().toISOString()
        }
    ];
    
    state.payments = [
        {
            id: '1',
            groupId: '1',
            groupName: 'Weekend Trip',
            description: 'Hotel Booking',
            amount: 2.5,
            settled: false,
            timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
            id: '2',
            groupId: '2',
            groupName: 'Roommates',
            description: 'Electricity Bill',
            amount: 0.75,
            settled: true,
            timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
            id: '3',
            groupId: '1',
            groupName: 'Weekend Trip',
            description: 'Dinner',
            amount: 1.2,
            settled: false,
            timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
        }
    ];
    
    state.stats.totalGroups = state.groups.length;
    state.stats.pendingPayments = state.payments.filter(p => !p.settled).length;
    state.stats.settledPayments = state.payments.filter(p => p.settled).length;
    
    updateStatsUI();
    
    // Populate filters
    const groupFilter = document.getElementById('group-filter');
    if (groupFilter) {
        state.groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.name;
            groupFilter.appendChild(option);
        });
        groupFilter.onchange = loadPaymentHistory;
    }
    
    const statusFilter = document.getElementById('status-filter');
    if (statusFilter) {
        statusFilter.onchange = loadPaymentHistory;
    }
}

// ============================
// UI Helpers
// ============================

function updateStatsUI() {
    document.getElementById('total-groups').textContent = state.stats.totalGroups;
    document.getElementById('pending-payments').textContent = state.stats.pendingPayments;
    document.getElementById('settled-payments').textContent = state.stats.settledPayments;
}

function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    overlay.querySelector('.loading-text').textContent = message;
    overlay.style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function startQRScanner() {
    showToast('QR Scanner coming soon!', 'info');
}
const PROGRAM_ID = new solanaWeb3.PublicKey("HU4wkHJ97BBeabrchh94ZvMPViJrh8dCZfA3K5Cz1qbY");

async function getGroupAddress(creatorPubkey, groupName) {
    const [groupPda] = await solanaWeb3.PublicKey.findProgramAddress(
        [
            Buffer.from("group"), 
            creatorPubkey.toBuffer(), 
            Buffer.from(groupName)
        ],
        PROGRAM_ID
    );
    return groupPda;
}
// Add this function to app.js
async function executePayment(expenseAddress, groupAddress, memberIndex, recipientWallet) {
    showLoading('Approving SOL Transfer...');
    try {
        const provider = await getProvider();
        const program = new anchor.Program(idl, PROGRAM_ID, provider);

        // Convert addresses to PublicKeys
        const expenseKey = new solanaWeb3.PublicKey(expenseAddress);
        const groupKey = new solanaWeb3.PublicKey(groupAddress);
        const recipientKey = new solanaWeb3.PublicKey(recipientWallet);

        // The magic happens here: calling the Rust function
        await program.methods
            .payExpense(memberIndex) // This must be the index (0, 1, 2...) of the friend in the group
            .accounts({
                expense: expenseKey,
                group: groupKey,
                member: provider.wallet.publicKey,
                payer: recipientKey, // The person who gets the money back
                systemProgram: solanaWeb3.SystemProgram.programId,
            })
            .rpc();

        showToast("Success! Share paid on-chain.", "success");
        await fetchBlockchainData(); // Refresh UI
    } catch (err) {
        console.error("Payment Error:", err);
        showToast("Transaction failed. Check console.", "danger");
    } finally {
        hideLoading();
    }
}
async function payFriendOnChain(memberIndex, expensePDA, groupPDA, payerWallet) {
    if (!program) return showToast("App not initialized", "danger");
    
    showLoading("Signing Transaction...");
    try {
        // This maps exactly to your pay_expense(ctx, member_index) in Rust
        const tx = await program.methods
            .payExpense(memberIndex)
            .accounts({
                expense: new solanaWeb3.PublicKey(expensePDA),
                group: new solanaWeb3.PublicKey(groupPDA),
                member: window.solana.publicKey,
                payer: new solanaWeb3.PublicKey(payerWallet), // The person who originally paid
                systemProgram: solanaWeb3.SystemProgram.programId,
            })
            .rpc();

        showToast("Success! Payment recorded on-chain.", "success");
        console.log("Transaction Signature:", tx);
        
        // Refresh your UI here
        loadPaymentHistory(); 
    } catch (err) {
        console.error("Payment failed:", err);
        showToast("Transaction rejected or failed", "danger");
    } finally {
        hideLoading();
    }
}
function getProvider() {
    if (!window.solana) {
        showToast("Phantom wallet not found!", "error");
        return null;
    }
    // Connection is the network (Devnet), window.solana is the signer
    const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl("devnet"), "confirmed");
    const provider = new anchor.AnchorProvider(
        connection, 
        window.solana, 
        { preflightCommitment: "processed" }
    );
    return provider;
}
console.log('✅ App ready!');
