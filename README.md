# OpenClaw Setup

<div align="center">
  <img src="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png" alt="OpenClaw Banner" width="100%" />
  
  <h3>The easiest way to build Solana AI Agents</h3>
  
  <p>
    <a href="#quick-start">Quick Start</a> •
    <a href="#features">Features</a> •
    <a href="#how-it-works">How It Works</a> •
    <a href="#troubleshooting">Troubleshooting</a>
  </p>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Solana](https://img.shields.io/badge/Solana-Powered-black?logo=solana)](https://solana.com)
  [![Node.js](https://img.shields.io/badge/Node.js-v18+-green?logo=node.js)](https://nodejs.org)
</div>

---

## 🚀 Quick Start

Get your Solana AI Agent running in under 2 minutes.

### The One-Liner (Recommended)
Works on macOS, Linux, and Windows (WSL).

```bash
curl -fsSL https://raw.githubusercontent.com/Arpit-Khandelwal/openclaw-setup/main/install.sh | bash
```

### Alternative: npm
If you prefer using Node.js directly:

```bash
npx openclaw-setup
```

---

## ✨ Features

- **Interactive Setup Wizard**: Guided CLI experience (like `create-next-app`)
- **Secure Wallet Generation**: 
  - Creates new Solana wallets locally
  - Imports existing keys (Base58/Hex) or seed phrases
  - **AES-256-GCM Encryption** for private keys
- **Skill Ecosystem**:
  - Pre-installed official plugins (`solana-agent-kit`, `plugin-defi`, `plugin-nft`)
  - Integrated **OpenSkills** registry for community tools
  - One-click installation of `solana-trader-pro`, `dao-governance`, and more
- **Smart Defaults**:
  - Automatically configured for **Devnet** (safe testing)
  - Auto-detects system dependencies
  - Handles RPC configuration

---

## 🛠️ How It Works

1. **System Check**: Verifies Node.js (v18+), npm, and git.
2. **Identity**: Sets up your local developer profile.
3. **Skills**: You choose the capabilities your agent needs:
   - 💸 **Trading**: Jupiter, Drift, PumpFun
   - 🖼️ **NFTs**: Metaplex, Tensor
   - 🧠 **Intelligence**: Web Search, Code Analysis
   - 🌐 **Social**: Twitter/X integration
4. **Wallet**: Securely sets up a Solana keypair (encrypted with your password).
5. **Launch**: Generates a ready-to-use agent configuration.

---

## 📦 What You Get

After running the setup, your environment will be ready at `~/.openclaw`:

```text
~/.openclaw/
├── config.json          # Agent configuration
├── wallets/
│   └── wallet.json      # Encrypted keystore
├── skills/              # Installed capabilities
│   ├── solana-agent-kit/
│   ├── open-skills/
│   └── ...
└── bin/
    └── openclaw         # The main CLI tool
```

---

## 🔧 Troubleshooting

**"Permission denied" errors?**
```bash
chmod +x install.sh
sudo chown -R $(whoami) ~/.openclaw
```

**Node.js not found?**
OpenClaw requires Node.js v18 or higher.
```bash
# Install via nvm (recommended)
nvm install 18
nvm use 18
```

**Wallet decryption failed?**
Ensure you are using the correct password set during initialization. If lost, you must reset your wallet (requires seed phrase).

---

## 🤝 Contributing

We love community contributions!
1. Fork the repo
2. Create a feature branch
3. Submit a PR

**Developed with ❤️ by the OpenClaw Community**
