SplitSol: Decentralized Expense Splitting
SplitSol is a decentralized application (dApp) built on the Solana blockchain that allows groups of friends or coworkers to track and settle expenses transparently. No more "who owes who"—every transaction is verified and recorded on-chain.

🚀 Key Features
Group Creation: Create on-chain groups with unique members.

Expense Tracking: Log expenses with descriptions and automatic split calculations.

On-Chain Settlements: Pay your share directly using SOL.

Real-time History: View a transparent ledger of all group activities.

Non-Custodial: Your funds stay in your wallet until you decide to pay.

🛠 Tech Stack
Smart Contract: Rust + Anchor Framework

Frontend: HTML5, Tailwind CSS, JavaScript (ES6+)

Provider: Solana Web3.js & @coral-xyz/anchor

Wallet: Phantom Wallet

🏁 Getting Started
Prerequisites
Phantom Wallet: Install here

Devnet SOL: Set your wallet to "Devnet" and get free SOL from the Solana Faucet.

Running Locally
Since this project fetches an idl.json file, it must be run through a local server.

Clone the repo:

Bash
git clone https://github.com/YOUR_USERNAME/splitsol-dapp.git
cd splitsol-dapp
Launch a Server:

If using VS Code, click "Go Live" (Live Server extension).

Or use Python: python -m http.server 8000

Access the app: Open http://localhost:5500 (or 8000) in your browser.

📂 Project Structure
Plaintext
.
├── index.html          # Main application UI
├── app.js              # Frontend logic and Solana integration
├── idl.json            # The "Interface" for the smart contract
├── assets/             # Images and styling assets
└── README.md           # You are here!
📜 Smart Contract Logic
The program is deployed on Solana Devnet. It uses Program Derived Addresses (PDAs) to store group and expense data securely.

Program ID: HU4wkHJ97BBeabrchh94ZvMPViJrh8dCZfA3K5Cz1qbY

🤝 Contributing
Fork the Project

Create your Feature Branch (git checkout -b feature/AmazingFeature)

Commit your Changes (git commit -m 'Add some AmazingFeature')

Push to the Branch (git push origin feature/AmazingFeature)

Open a Pull Request
