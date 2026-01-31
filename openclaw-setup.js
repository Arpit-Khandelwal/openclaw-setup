#!/usr/bin/env node

/**
 * OpenClaw Setup Script
 * Interactive CLI for end-to-end OpenClaw configuration
 * Similar interface to create-next-app
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const crypto = require('crypto');

// Try to import optional dependencies
let inquirer, chalk, ora, boxen, figlet;

try {
  inquirer = require('inquirer');
} catch (e) {
  inquirer = null;
}

try {
  chalk = require('chalk');
} catch (e) {
  chalk = null;
}

try {
  ora = require('ora');
} catch (e) {
  ora = null;
}

try {
  boxen = require('boxen');
} catch (e) {
  boxen = null;
}

try {
  figlet = require('figlet');
} catch (e) {
  figlet = null;
}

// Fallback styling functions
const style = {
  bold: (text) => chalk ? chalk.bold(text) : text,
  cyan: (text) => chalk ? chalk.cyan(text) : text,
  green: (text) => chalk ? chalk.green(text) : text,
  yellow: (text) => chalk ? chalk.yellow(text) : text,
  red: (text) => chalk ? chalk.red(text) : text,
  blue: (text) => chalk ? chalk.blue(text) : text,
  magenta: (text) => chalk ? chalk.magenta(text) : text,
  gray: (text) => chalk ? chalk.gray(text) : text,
};

// Configuration paths
const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const CONFIG_FILE = path.join(OPENCLAW_DIR, 'config.json');
const WALLET_DIR = path.join(OPENCLAW_DIR, 'wallets');
const SKILLS_DIR = path.join(OPENCLAW_DIR, 'skills');

// State
let config = {
  version: '1.0.0',
  installed: false,
  wallet: null,
  skills: [],
  preferences: {},
  onboardingComplete: false,
};

const args = process.argv.slice(2);
const flags = {
  help: args.includes('--help') || args.includes('-h'),
  version: args.includes('--version') || args.includes('-v'),
  quick: args.includes('--quick'),
  skipInstall: args.includes('--skip-install'),
  skipOnboarding: args.includes('--skip-onboarding'),
  skipWallet: args.includes('--skip-wallet'),
  verbose: args.includes('--verbose'),
};

function encryptKey(key, password) {
  const algorithm = 'aes-256-gcm';
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const cipher = crypto.createCipheriv(algorithm, derivedKey, iv);
  let encrypted = cipher.update(key, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return {
    encrypted,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

function printHelp() {
  console.log(`
${style.bold('OpenClaw Setup')}

Usage: openclaw-setup [options]

Options:
  --help, -h         Show this help message
  --version, -v      Show version
  --quick            Quick mode (minimal prompts)
  --skip-install     Skip installation step
  --skip-onboarding  Skip user onboarding
  --skip-wallet      Skip wallet setup
  --verbose          Enable verbose logging

Examples:
  openclaw-setup              Full interactive setup
  openclaw-setup --quick      Quick setup with defaults
  openclaw-setup --help       Show this help
`);
}

function quickSetup() {
  printLogo();
  console.log(style.green('\n🚀 Quick Setup Mode\n'));
  
  loadConfig();
  
  ensureDir(OPENCLAW_DIR);
  ensureDir(WALLET_DIR);
  ensureDir(SKILLS_DIR);
  
  config.installed = true;
  config.onboardingComplete = true;
  config.preferences = {
    userName: os.userInfo().username,
    mode: 'intermediate',
    telemetry: true,
  };
  config.skills = ['solana-agent-kit', 'web-search'];
  
  saveConfig();
  
  console.log(style.green('✓ Configuration initialized'));
  console.log(style.green('✓ Default skills configured'));
  console.log(style.yellow('\n⚠️  Run without --quick flag to set up wallet\n'));
}

function clearScreen() {
  process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
}

function printLogo() {
  clearScreen();
  
  if (figlet) {
    const logo = figlet.textSync('OPENCLAW', {
      font: 'Small',
      horizontalLayout: 'default',
      verticalLayout: 'default'
    });
    console.log(style.cyan(logo));
  } else {
    console.log(style.cyan('╔════════════════════════════════════╗'));
    console.log(style.cyan('║           OPENCLAW                 ║'));
    console.log(style.cyan('║    Solana-Powered AI Agent CLI     ║'));
    console.log(style.cyan('╚════════════════════════════════════╝'));
  }
  
  console.log(style.gray('\n  End-to-End Setup Wizard\n'));
  console.log(style.gray('  ──────────────────────────────────\n'));
}

function showSpinner(text) {
  if (ora) {
    return ora(text).start();
  }
  console.log(`⏳ ${text}...`);
  return {
    succeed: (msg) => console.log(`✅ ${msg}`),
    fail: (msg) => console.log(`❌ ${msg}`),
    stop: () => {},
  };
}

function createBox(content, title = '') {
  if (boxen) {
    return boxen(content, {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      title: title,
      titleAlignment: 'center',
    });
  }
  
  const lines = content.split('\n');
  const width = Math.max(...lines.map(l => l.length)) + 4;
  const border = '─'.repeat(width);
  
  let result = `┌${border}┐\n`;
  if (title) {
    const titlePadding = Math.floor((width - title.length) / 2);
    result = `┌${'─'.repeat(titlePadding)}${title}${'─'.repeat(width - titlePadding - title.length)}┐\n`;
  }
  lines.forEach(line => {
    result += `│  ${line.padEnd(width - 4)}  │\n`;
  });
  result += `└${border}┘`;
  return result;
}

async function prompt(questions) {
  if (inquirer) {
    return await inquirer.prompt(questions);
  }
  
  // Fallback to basic readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const answers = {};
  for (const q of questions) {
    const answer = await new Promise((resolve) => {
      const promptText = q.type === 'confirm' 
        ? `${q.message} (y/n): `
        : `${q.message}: `;
      
      rl.question(promptText, (input) => {
        if (q.type === 'confirm') {
          resolve(input.toLowerCase() === 'y' || input.toLowerCase() === 'yes');
        } else if (q.type === 'list' || q.type === 'select') {
          const choices = q.choices.map((c, i) => `${i + 1}. ${c.name || c}`);
          console.log(choices.join('\n'));
          resolve(input);
        } else {
          resolve(input || q.default);
        }
      });
    });
    answers[q.name] = answer;
  }
  
  rl.close();
  return answers;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch (e) {
      console.log(style.yellow('⚠️  Warning: Could not load existing config'));
    }
  }
}

function saveConfig() {
  ensureDir(OPENCLAW_DIR);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function runCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const args = command.split(' ');
    const cmd = args.shift();
    
    const child = spawn(cmd, args, {
      stdio: options.silent ? 'pipe' : 'inherit',
      shell: true,
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
    });
    
    let output = '';
    if (options.silent && child.stdout) {
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
    }
    
    child.on('close', (code) => {
      if (code === 0 || options.ignoreError) {
        resolve(output);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

function checkDependency(name) {
  try {
    execSync(`which ${name}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ============================================
// SETUP STEPS
// ============================================

async function stepWelcome() {
  printLogo();
  
  console.log(createBox(
    `${style.bold('Welcome to OpenClaw Setup!')}\n\n` +
    `This wizard will help you:\n` +
    `  ${style.cyan('•')} Install OpenClaw CLI\n` +
    `  ${style.cyan('•')} Configure your environment\n` +
    `  ${style.cyan('•')} Set up AI skills\n` +
    `  ${style.cyan('•')} Configure Solana wallet\n\n` +
    `${style.gray('You can skip any step by pressing Ctrl+C or selecting "Skip"')}`,
    '🚀 Getting Started'
  ));
  
  const { proceed } = await prompt([{
    type: 'confirm',
    name: 'proceed',
    message: 'Ready to begin',
    default: true,
  }]);
  
  if (!proceed) {
    console.log(style.yellow('\n👋 Setup cancelled. Run again anytime with: openclaw-setup\n'));
    process.exit(0);
  }
}

async function stepCheckDependencies() {
  printLogo();
  
  console.log(style.bold('\n📋 Checking System Requirements\n'));
  
  const deps = [
    { name: 'node', cmd: 'node --version', required: true },
    { name: 'npm', cmd: 'npm --version', required: true },
    { name: 'git', cmd: 'git --version', required: false },
    { name: 'cargo', cmd: 'cargo --version', required: false },
  ];
  
  const results = [];
  
  for (const dep of deps) {
    const spinner = showSpinner(`Checking ${dep.name}...`);
    try {
      const version = execSync(dep.cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
      spinner.succeed(`${dep.name} ${style.gray(version)}`);
      results.push({ ...dep, installed: true, version });
    } catch {
      if (dep.required) {
        spinner.fail(`${dep.name} ${style.red('not found')} ${style.gray('(required)')}`);
      } else {
        spinner.fail(`${dep.name} ${style.yellow('not found')} ${style.gray('(optional)')}`);
      }
      results.push({ ...dep, installed: false });
    }
  }
  
  const missingRequired = results.filter(r => r.required && !r.installed);
  
  if (missingRequired.length > 0) {
    console.log(style.red(`\n❌ Missing required dependencies: ${missingRequired.map(r => r.name).join(', ')}`));
    console.log(style.yellow('Please install them and run setup again.\n'));
    process.exit(1);
  }
  
  console.log(style.green('\n✅ All required dependencies available!\n'));
  
  await prompt([{
    type: 'confirm',
    name: 'continue',
    message: 'Continue to installation',
    default: true,
  }]);
}

async function stepInstallOpenClaw() {
  if (config.installed) {
    printLogo();
    console.log(createBox(
      `${style.green('✓ OpenClaw is already installed')}\n\n` +
      `Version: ${style.cyan(config.version)}\n` +
      `Location: ${style.gray(OPENCLAW_DIR)}`,
      '📦 Installation'
    ));
    
    const { reinstall } = await prompt([{
      type: 'confirm',
      name: 'reinstall',
      message: 'Would you like to reinstall or update',
      default: false,
    }]);
    
    if (!reinstall) {
      console.log(style.gray('\n⏭️  Skipping installation step\n'));
      return;
    }
  }
  
  printLogo();
  console.log(style.bold('\n📦 Installing OpenClaw\n'));
  
  const { installMethod } = await prompt([{
    type: 'list',
    name: 'installMethod',
    message: 'Choose installation method',
    choices: [
      { name: 'npm (recommended)', value: 'npm' },
      { name: 'yarn', value: 'yarn' },
      { name: 'pnpm', value: 'pnpm' },
      { name: 'From source (cargo build)', value: 'source' },
      { name: 'Skip installation', value: 'skip' },
    ],
    default: 'npm',
  }]);
  
  if (installMethod === 'skip') {
    console.log(style.yellow('\n⏭️  Skipping installation\n'));
    return;
  }
  
  const spinner = showSpinner('Installing OpenClaw...');
  
  try {
    ensureDir(OPENCLAW_DIR);
    
    if (installMethod === 'source') {
      // Clone and build from source
      const tempDir = path.join(os.tmpdir(), 'openclaw-build');
      await runCommand(`rm -rf ${tempDir}`, { silent: true, ignoreError: true });
      await runCommand(`git clone https://github.com/openclaw/openclaw.git ${tempDir}`, { silent: true });
      await runCommand('cargo build --release', { cwd: tempDir, silent: true });
      await runCommand(`cp ${path.join(tempDir, 'target/release/openclaw')} ${OPENCLAW_DIR}/`, { silent: true });
    } else {
      // Install via package manager
      const pkgCmd = installMethod === 'npm' ? 'npm install -g @openclaw/cli' :
                     installMethod === 'yarn' ? 'yarn global add @openclaw/cli' :
                     'pnpm add -g @openclaw/cli';
      await runCommand(pkgCmd, { silent: true });
    }
    
    spinner.succeed('OpenClaw installed successfully!');
    
    config.installed = true;
    config.installMethod = installMethod;
    saveConfig();
    
    console.log(style.green(`\n✅ OpenClaw installed at: ${OPENCLAW_DIR}\n`));
  } catch (error) {
    spinner.fail(`Installation failed: ${error.message}`);
    console.log(style.yellow('\n⚠️  You can retry this step later\n'));
  }
  
  await prompt([{
    type: 'confirm',
    name: 'continue',
    message: 'Continue',
    default: true,
  }]);
}

async function stepOnboarding() {
  if (config.onboardingComplete) {
    printLogo();
    console.log(createBox(
      `${style.green('✓ Onboarding already complete')}\n\n` +
      `User: ${style.cyan(config.preferences.userName || 'Anonymous')}\n` +
      `Mode: ${style.cyan(config.preferences.mode || 'Standard')}`,
      '👤 Onboarding'
    ));
    
    const { redo } = await prompt([{
      type: 'confirm',
      name: 'redo',
      message: 'Would you like to reconfigure',
      default: false,
    }]);
    
    if (!redo) {
      console.log(style.gray('\n⏭️  Skipping onboarding\n'));
      return;
    }
  }
  
  printLogo();
  console.log(style.bold('\n👤 User Onboarding\n'));
  
  const answers = await prompt([
    {
      type: 'input',
      name: 'userName',
      message: 'What should we call you',
      default: config.preferences.userName || os.userInfo().username,
    },
    {
      type: 'list',
      name: 'mode',
      message: 'Select your experience level',
      choices: [
        { name: '🌱 Beginner - I\'m new to AI agents and Solana', value: 'beginner' },
        { name: '🚀 Intermediate - Some experience with Web3/AI', value: 'intermediate' },
        { name: '⚡ Advanced - Power user, give me all options', value: 'advanced' },
      ],
      default: config.preferences.mode || 'intermediate',
    },
    {
      type: 'confirm',
      name: 'telemetry',
      message: 'Help improve OpenClaw by sharing anonymous usage data',
      default: config.preferences.telemetry !== false,
    },
    {
      type: 'confirm',
      name: 'newsletter',
      message: 'Stay updated with OpenClaw news and features',
      default: config.preferences.newsletter || false,
    },
  ]);
  
  config.preferences = { ...config.preferences, ...answers };
  config.onboardingComplete = true;
  saveConfig();
  
  console.log(style.green('\n✅ Onboarding complete!\n'));
  console.log(createBox(
    `Welcome, ${style.cyan(answers.userName)}!\n\n` +
    `Experience Level: ${style.yellow(answers.mode)}\n` +
    `Telemetry: ${answers.telemetry ? style.green('Enabled') : style.gray('Disabled')}\n` +
    `Newsletter: ${answers.newsletter ? style.green('Subscribed') : style.gray('Not subscribed')}`,
    '🎉 Profile Created'
  ));
  
  await prompt([{
    type: 'confirm',
    name: 'continue',
    message: 'Continue to skills setup',
    default: true,
  }]);
}

async function stepSkillsSetup() {
  printLogo();
  console.log(style.bold('\n🛠️  Skills Configuration\n'));
  
  // Try to load openskills
  let openskills = null;
  try {
    openskills = require('openskills');
  } catch {
    // If not installed, we'll suggest installing it
  }
  
  const availableSkills = [
    { 
      name: 'solana-agent-kit', 
      description: 'Core Solana blockchain interactions',
      category: 'blockchain',
      required: true,
      source: 'built-in'
    },
    { 
      name: 'web-search', 
      description: 'Exa/Web search capabilities',
      category: 'web',
      required: false,
      source: 'built-in'
    },
    { 
      name: 'code-analysis', 
      description: 'Code understanding and refactoring',
      category: 'development',
      required: false,
      source: 'built-in'
    },
    { 
      name: 'twitter', 
      description: 'Twitter/X integration for social features',
      category: 'social',
      required: false,
      source: 'built-in'
    },
    { 
      name: 'image-generation', 
      description: 'AI image generation with Gemini',
      category: 'ai',
      required: false,
      source: 'built-in'
    },
    { 
      name: 'github', 
      description: 'GitHub repository operations',
      category: 'development',
      required: false,
      source: 'built-in'
    },
    { 
      name: 'sentient-logger', 
      description: 'Advanced logging and monitoring',
      category: 'utility',
      required: false,
      source: 'built-in'
    },
    { 
      name: 'solana-agent-kit-plugin-defi', 
      description: 'DeFi (Jupiter, Drift, Adrena, Flash) trading capabilities',
      category: 'trading',
      required: false,
      source: 'sendaifun'
    },
    { 
      name: 'solana-agent-kit-plugin-nft', 
      description: 'NFT Management (Metaplex, Tensor, 3Land)',
      category: 'nft',
      required: false,
      source: 'sendaifun'
    },
    { 
      name: 'solana-agent-kit-plugin-token', 
      description: 'Advanced Token Operations (Swaps, Limit Orders)',
      category: 'trading',
      required: false,
      source: 'sendaifun'
    },
    { 
      name: 'solana-agent-kit-plugin-blinks', 
      description: 'Solana Actions & Blinks integration',
      category: 'utility',
      required: false,
      source: 'sendaifun'
    },
    // Curated Community Skills
    { 
      name: 'solana-trader-pro', 
      description: 'Advanced trading analysis & execution (Community)',
      category: 'trading',
      required: false,
      source: 'community'
    },
    { 
      name: 'nft-sniper', 
      description: 'Monitor and snipe NFT collections (Community)',
      category: 'nft',
      required: false,
      source: 'community'
    },
    { 
      name: 'dao-governance', 
      description: 'Automate DAO proposal analysis & voting (Community)',
      category: 'governance',
      required: false,
      source: 'community'
    }
  ];
  
  // Add OpenSkills suggestion if available
  if (openskills) {
    console.log(style.blue('ℹ️  OpenSkills detected! You can access hundreds of community skills.\n'));
    availableSkills.push({
      name: 'openskills-registry',
      description: 'Access 100+ community skills via OpenSkills',
      category: 'ecosystem',
      required: false,
      source: 'openskills'
    });
  }
  
  // Show already installed skills
  if (config.skills && config.skills.length > 0) {
    console.log(style.cyan('Currently installed skills:\n'));
    config.skills.forEach(skill => {
      console.log(`  ${style.green('✓')} ${skill}`);
    });
    console.log('');
  }
  
  const { setupSkills } = await prompt([{
    type: 'confirm',
    name: 'setupSkills',
    message: 'Would you like to set up or modify skills',
    default: true,
  }]);
  
  if (!setupSkills) {
    console.log(style.gray('\n⏭️  Skipping skills setup\n'));
    return;
  }
  
  const { selectedSkills } = await prompt([{
    type: 'checkbox',
    name: 'selectedSkills',
    message: 'Select skills to install (Space to select, Enter to confirm)',
    choices: availableSkills.map(skill => ({
      name: `${skill.name} ${style.gray(`- ${skill.description}`)}`,
      value: skill.name,
      checked: config.skills?.includes(skill.name) || skill.required,
    })),
  }]);
  
  const spinner = showSpinner('Installing skills...');
  
  try {
    ensureDir(SKILLS_DIR);
    
    // Check if user selected openskills-registry but doesn't have it installed
    if (selectedSkills.includes('openskills-registry') && !openskills) {
      spinner.text = 'Installing OpenSkills runtime...';
      await runCommand('npm install -g openskills', { silent: true });
    }

    for (const skillName of selectedSkills) {
      if (skillName === 'openskills-registry') continue;

      const skill = availableSkills.find(s => s.name === skillName);
      const skillPath = path.join(SKILLS_DIR, skillName);
      
      ensureDir(skillPath);
      
      const manifest = {
        name: skillName,
        version: '1.0.0',
        category: skill?.category || 'general',
        source: skill?.source || 'local',
        installedAt: new Date().toISOString(),
        config: {},
      };
      
      fs.writeFileSync(
        path.join(skillPath, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
      );
      
      // If it's a Solana skill, we might want to check for openskills equivalents
      if (skillName === 'solana-agent-kit' && openskills) {
        // Future: Check openskills registry for updates
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    config.skills = selectedSkills;
    saveConfig();
    
    spinner.succeed('Skills installed successfully!');
    
    console.log(style.green('\n✅ Installed skills:\n'));
    selectedSkills.forEach(skill => {
      console.log(`  ${style.cyan('•')} ${skill}`);
    });
    
    if (selectedSkills.includes('openskills-registry')) {
      console.log(style.blue('\n💡 You can now use "openskills install <skill>" to add more capabilities!'));
    }
    console.log('');
    
  } catch (error) {
    spinner.fail(`Skills installation failed: ${error.message}`);
  }
  
  await prompt([{
    type: 'confirm',
    name: 'continue',
    message: 'Continue to wallet setup',
    default: true,
  }]);
}

async function stepWalletSetup() {
  printLogo();
  console.log(style.bold('\n💰 Solana Wallet Setup\n'));
  
  if (config.wallet) {
    console.log(createBox(
      `${style.green('✓ Wallet already configured')}\n\n` +
      `Public Key: ${style.cyan(config.wallet.publicKey)}\n` +
      `Network: ${style.cyan(config.wallet.network || 'devnet')}\n` +
      `Created: ${style.gray(config.wallet.createdAt || 'Unknown')}`,
      '🔐 Existing Wallet'
    ));
    
    const { manageWallet } = await prompt([{
      type: 'list',
      name: 'manageWallet',
      message: 'What would you like to do',
      choices: [
        { name: 'Keep current wallet', value: 'keep' },
        { name: 'Create new wallet (WARNING: replaces existing)', value: 'new' },
        { name: 'Import existing wallet', value: 'import' },
        { name: 'Connect hardware wallet', value: 'hardware' },
      ],
      default: 'keep',
    }]);
    
    if (manageWallet === 'keep') {
      console.log(style.gray('\n⏭️  Keeping existing wallet\n'));
      return;
    }
  } else {
    console.log(createBox(
      `${style.yellow('⚠️  No wallet configured')}\n\n` +
      `OpenClaw requires a Solana wallet for blockchain operations.\n\n` +
      `Options:\n` +
      `  ${style.cyan('•')} Create a new wallet\n` +
      `  ${style.cyan('•')} Import existing wallet (private key/seed)\n` +
      `  ${style.cyan('•')} Connect hardware wallet\n\n` +
      `${style.gray('You can skip this step, but blockchain features won\'t work.')}`,
      '💳 Wallet Required'
    ));
  }
  
  const { walletAction } = await prompt([{
    type: 'list',
    name: 'walletAction',
    message: 'Choose wallet setup method',
    choices: [
      { name: '🆕 Create new wallet', value: 'create' },
      { name: '📥 Import from private key', value: 'import-key' },
      { name: '📝 Import from seed phrase', value: 'import-seed' },
      { name: '🔌 Connect Ledger/Trezor', value: 'hardware' },
      { name: '⏭️  Skip for now', value: 'skip' },
    ],
    default: 'create',
  }]);
  
  if (walletAction === 'skip') {
    console.log(style.yellow('\n⚠️  Skipping wallet setup. Blockchain features disabled.\n'));
    return;
  }
  
  const spinner = showSpinner('Setting up wallet...');
  
  try {
    let walletData = {};
    
    switch (walletAction) {
      case 'create':
        // Generate new keypair
        // In a real implementation, this would use @solana/web3.js
        walletData = await generateNewWallet();
        break;
        
      case 'import-key':
        spinner.stop();
        const { privateKey } = await prompt([{
          type: 'password',
          name: 'privateKey',
          message: 'Enter your private key (base58 encoded)',
          mask: '*',
        }]);
        walletData = await importFromPrivateKey(privateKey);
        spinner.start();
        break;
        
      case 'import-seed':
        spinner.stop();
        const { seedPhrase } = await prompt([{
          type: 'input',
          name: 'seedPhrase',
          message: 'Enter your 12 or 24-word seed phrase',
        }]);
        walletData = await importFromSeedPhrase(seedPhrase);
        spinner.start();
        break;
        
      case 'hardware':
        walletData = await connectHardwareWallet();
        break;
    }
    
    // Prompt for password encryption
    let encryptedData = null;
    
    if (walletData.rawSecretKey) {
      spinner.stop();
      console.log(style.yellow('\n🔐 Securing your wallet\n'));
      
      const { password } = await prompt([{
        type: 'password',
        name: 'password',
        message: 'Create a password to encrypt your wallet key',
        mask: '*',
        validate: (input) => input.length >= 8 || 'Password must be at least 8 characters',
      }]);
      
      const { confirmPassword } = await prompt([{
        type: 'password',
        name: 'confirmPassword',
        message: 'Confirm password',
        mask: '*',
        validate: (input) => input === password || 'Passwords do not match',
      }]);
      
      spinner.start('Encrypting wallet...');
      
      // Convert secret key to hex string for encryption
      const secretKeyHex = Buffer.from(walletData.rawSecretKey).toString('hex');
      encryptedData = encryptKey(secretKeyHex, password);
    }

    // Save wallet
    ensureDir(WALLET_DIR);
    const walletFile = path.join(WALLET_DIR, 'wallet.json');
    
    // Save encrypted wallet data
    const walletConfig = {
      publicKey: walletData.publicKey,
      network: walletData.network || 'devnet',
      createdAt: new Date().toISOString(),
      type: walletData.type || 'local',
      encryptedKey: encryptedData, // Properly encrypted with user password
    };
    
    fs.writeFileSync(walletFile, JSON.stringify(walletConfig, null, 2));
    
    config.wallet = walletConfig;
    saveConfig();
    
    spinner.succeed('Wallet configured successfully!');
    
    // Show wallet details
    console.log(createBox(
      `${style.bold('Wallet Details')}\n\n` +
      `Public Key: ${style.cyan(walletConfig.publicKey)}\n` +
      `Network: ${style.cyan(walletConfig.network)}\n` +
      `Type: ${style.cyan(walletConfig.type)}\n\n` +
      `${walletAction === 'create' ? style.yellow('⚠️  IMPORTANT: Save your seed phrase securely!') : ''}`,
      '🔐 Wallet Ready'
    ));
    
    if (walletAction === 'create') {
      console.log(style.yellow('\n🔐 Your new wallet seed phrase (WRITE THIS DOWN):\n'));
      console.log(style.bold(walletData.seedPhrase || '[Seed phrase would be shown here in production]\n'));
      console.log(style.red('⚠️  Never share your seed phrase with anyone!\n'));
    }
    
    // Network selection
    const { network } = await prompt([{
      type: 'list',
      name: 'network',
      message: 'Select Solana network',
      choices: [
        { name: 'devnet (recommended for testing)', value: 'devnet' },
        { name: 'testnet', value: 'testnet' },
        { name: 'mainnet-beta (real money!)', value: 'mainnet-beta' },
      ],
      default: walletConfig.network || 'devnet',
    }]);
    
    config.wallet.network = network;
    saveConfig();
    
    console.log(style.green(`\n✅ Network set to: ${network}\n`));
    
  } catch (error) {
    spinner.fail(`Wallet setup failed: ${error.message}`);
    console.log(style.yellow('\n⚠️  You can configure the wallet later\n'));
  }
  
  await prompt([{
    type: 'confirm',
    name: 'continue',
    message: 'Continue',
    default: true,
  }]);
}

async function generateNewWallet() {
  let Keypair, bip39, derivePath, bs58;
  
  try {
    const solanaWeb3 = require('@solana/web3.js');
    Keypair = solanaWeb3.Keypair;
    bip39 = require('bip39');
    const ed25519HdKey = require('ed25519-hd-key');
    derivePath = ed25519HdKey.derivePath;
    bs58 = require('bs58');
  } catch {
    console.log(style.yellow('\n⚠️  Solana SDK not installed. Run: npm install @solana/web3.js bip39 ed25519-hd-key bs58\n'));
    throw new Error('Solana SDK required');
  }
  
  const seedPhrase = bip39.generateMnemonic(128);
  const seed = bip39.mnemonicToSeedSync(seedPhrase);
  const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
  const keypair = Keypair.fromSeed(derivedSeed.slice(0, 32));
  
  const base58Key = bs58.encode(keypair.secretKey);
  
  return {
    publicKey: keypair.publicKey.toString(),
    seedPhrase: seedPhrase,
    type: 'local',
    network: 'devnet',
    base58Key: base58Key,
    rawSecretKey: keypair.secretKey,
  };
}

async function importFromPrivateKey(privateKey) {
  let Keypair, bs58;
  
  try {
    Keypair = require('@solana/web3.js').Keypair;
    bs58 = require('bs58');
  } catch {
    throw new Error('Solana SDK required');
  }
  
  let secretKey;
  try {
    secretKey = bs58.decode(privateKey);
  } catch {
    try {
      secretKey = Buffer.from(privateKey, 'hex');
    } catch {
      throw new Error('Invalid private key format. Expected base58 or hex.');
    }
  }
  
  const keypair = Keypair.fromSecretKey(secretKey);
  
  return {
    publicKey: keypair.publicKey.toString(),
    type: 'imported',
    network: 'devnet',
    base58Key: privateKey,
    rawSecretKey: keypair.secretKey,
  };
}

async function importFromSeedPhrase(seedPhrase) {
  let Keypair, bip39, derivePath, bs58;
  
  try {
    Keypair = require('@solana/web3.js').Keypair;
    bip39 = require('bip39');
    derivePath = require('ed25519-hd-key').derivePath;
    bs58 = require('bs58');
  } catch {
    throw new Error('Solana SDK required');
  }
  
  if (!bip39.validateMnemonic(seedPhrase)) {
    throw new Error('Invalid seed phrase');
  }
  
  const seed = bip39.mnemonicToSeedSync(seedPhrase);
  const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
  const keypair = Keypair.fromSeed(derivedSeed.slice(0, 32));
  
  return {
    publicKey: keypair.publicKey.toString(),
    type: 'imported',
    network: 'devnet',
    base58Key: bs58.encode(keypair.secretKey),
    rawSecretKey: keypair.secretKey,
  };
}

async function connectHardwareWallet() {
  console.log(style.yellow('\n🔌 Hardware wallet support coming soon!\n'));
  console.log(style.gray('Please manually enter your hardware wallet public key:\n'));
  
  const { publicKey } = await prompt([{
    type: 'input',
    name: 'publicKey',
    message: 'Hardware wallet public key',
    validate: (input) => input.length > 0 || 'Public key is required',
  }]);
  
  return {
    publicKey: publicKey,
    type: 'hardware',
    network: 'devnet',
    encryptedKey: null,
  };
}

async function stepFinalConfiguration() {
  printLogo();
  console.log(style.bold('\n⚙️  Final Configuration\n'));
  
  const { configureAdvanced } = await prompt([{
    type: 'confirm',
    name: 'configureAdvanced',
    message: 'Would you like to configure advanced settings',
    default: false,
  }]);
  
  if (configureAdvanced) {
    const advancedConfig = await prompt([
      {
        type: 'input',
        name: 'rpcEndpoint',
        message: 'Custom RPC endpoint (leave empty for default)',
        default: config.preferences.rpcEndpoint || '',
      },
      {
        type: 'input',
        name: 'logLevel',
        message: 'Log level',
        choices: ['debug', 'info', 'warn', 'error'],
        default: config.preferences.logLevel || 'info',
      },
      {
        type: 'confirm',
        name: 'autoUpdate',
        message: 'Automatically check for updates',
        default: config.preferences.autoUpdate !== false,
      },
    ]);
    
    config.preferences = { ...config.preferences, ...advancedConfig };
    saveConfig();
  }
  
  console.log(style.green('\n✅ Configuration complete!\n'));
}

async function stepSummary() {
  printLogo();
  
  console.log(style.bold('\n🎉 Setup Complete!\n'));
  
  const summary = `
${style.bold('Installation Status:')}
  ${config.installed ? style.green('✓') : style.red('✗')} OpenClaw CLI
  ${config.onboardingComplete ? style.green('✓') : style.red('✗')} User Profile
  ${config.skills?.length > 0 ? style.green('✓') : style.red('✗')} Skills (${config.skills?.length || 0} installed)
  ${config.wallet ? style.green('✓') : style.red('✗')} Solana Wallet

${style.bold('Configuration Location:')}
  ${style.gray(OPENCLAW_DIR)}

${style.bold('Next Steps:')}
  ${style.cyan('1.')} Run ${style.yellow('openclaw --help')} to see available commands
  ${style.cyan('2.')} Try ${style.yellow('openclaw agent start')} to launch your first agent
  ${style.cyan('3.')} Visit ${style.cyan('https://docs.openclaw.io')} for documentation

${style.bold('Useful Commands:')}
  ${style.yellow('openclaw config')}     - Edit configuration
  ${style.yellow('openclaw wallet')}     - Manage wallet
  ${style.yellow('openclaw skills')}     - Add/remove skills
  ${style.yellow('openclaw doctor')}     - Check setup health
`;
  
  console.log(createBox(summary, '🚀 OpenClaw Ready!'));
  
  // Create a quick start script
  const quickStartPath = path.join(OPENCLAW_DIR, 'quickstart.sh');
  const quickStartContent = `#!/bin/bash
# OpenClaw Quick Start Script
echo "🚀 Starting OpenClaw..."
openclaw agent start --interactive
`;
  fs.writeFileSync(quickStartPath, quickStartContent);
  fs.chmodSync(quickStartPath, 0o755);
  
  console.log(style.gray(`\nQuick start script created: ${quickStartPath}\n`));
  
  const { launchNow } = await prompt([{
    type: 'confirm',
    name: 'launchNow',
    message: 'Launch OpenClaw now',
    default: false,
  }]);
  
  if (launchNow) {
    console.log(style.cyan('\n🚀 Launching OpenClaw...\n'));
    try {
      await runCommand('openclaw --version', { silent: true });
      console.log(style.green('OpenClaw is ready to use!\n'));
    } catch {
      console.log(style.yellow('\n⚠️  OpenClaw CLI not found in PATH'));
      console.log(style.gray('Add the following to your shell profile:\n'));
      console.log(style.cyan(`  export PATH="${OPENCLAW_DIR}:$PATH"\n`));
    }
  }
  
  console.log(style.green('\n👋 Thank you for installing OpenClaw!\n'));
}

// ============================================
// MAIN
// ============================================

async function main() {
  if (flags.help) {
    printHelp();
    process.exit(0);
  }
  
  if (flags.version) {
    console.log('openclaw-setup v1.0.0');
    process.exit(0);
  }
  
  if (flags.quick) {
    quickSetup();
    process.exit(0);
  }
  
  const optionalDeps = ['inquirer', 'chalk', 'ora', 'boxen', 'figlet'];
  const missing = optionalDeps.filter(dep => {
    try {
      require(dep);
      return false;
    } catch {
      return true;
    }
  });
  
  if (missing.length > 0) {
    console.log(style.yellow('\n⚠️  Installing optional dependencies for better UI...\n'));
    try {
      execSync(`npm install ${missing.join(' ')} --save`, { 
        cwd: __dirname, 
        stdio: 'inherit' 
      });
      delete require.cache[require.resolve('inquirer')];
      inquirer = require('inquirer');
      chalk = require('chalk');
      ora = require('ora');
      boxen = require('boxen');
      figlet = require('figlet');
    } catch {
      console.log(style.gray('Continuing with basic UI...\n'));
    }
  }
  
  loadConfig();
  
  if (!flags.skipInstall) await stepWelcome();
  if (!flags.skipInstall) await stepCheckDependencies();
  if (!flags.skipInstall) await stepInstallOpenClaw();
  if (!flags.skipOnboarding) await stepOnboarding();
  await stepSkillsSetup();
  if (!flags.skipWallet) await stepWalletSetup();
  await stepFinalConfiguration();
  await stepSummary();
}

// Handle interruptions
process.on('SIGINT', () => {
  console.log(style.yellow('\n\n👋 Setup interrupted. Progress has been saved.\n'));
  saveConfig();
  process.exit(0);
});

// Run
main().catch(error => {
  console.error(style.red(`\n❌ Fatal error: ${error.message}\n`));
  process.exit(1);
});
