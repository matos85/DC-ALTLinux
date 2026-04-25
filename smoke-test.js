const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = './test-screenshots';
const BASE_URL = 'http://localhost:3000';
const CREDENTIALS = {
  username: 'admin',
  password: 'AdminPanel123!'
};

const SECTIONS = [
  'users',
  'groups',
  'shares',
  'computers',
  'ou',
  'dns',
  'servers',
  'jobs'
];

class SmokeTestRunner {
  constructor() {
    this.browser = null;
    this.page = null;
    this.results = {
      timestamp: new Date().toISOString(),
      passed: [],
      warnings: [],
      errors: [],
      screenshots: [],
      consoleErrors: [],
      apiErrors: []
    };
  }

  async setup() {
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }

    this.browser = await chromium.launch({ headless: false });
    this.page = await this.browser.newPage();

    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.results.consoleErrors.push(`[Console Error] ${msg.text()}`);
      }
    });

    this.page.on('response', response => {
      if (response.status() >= 400) {
        this.results.apiErrors.push(`[API Error] ${response.status()} - ${response.url()}`);
      }
    });
  }

  async screenshot(name) {
    const filename = `${name}-${Date.now()}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    await this.page.screenshot({ path: filepath, fullPage: true });
    this.results.screenshots.push(filename);
    return filename;
  }

  async testInitialLoad() {
    console.log('Testing: Initial Load...');
    try {
      const response = await this.page.goto(BASE_URL, { waitUntil: 'networkidle' });
      
      if (response.ok()) {
        await this.screenshot('01-initial-load');
        this.results.passed.push('Initial load successful');
      } else {
        this.results.errors.push(`Initial load failed with status: ${response.status()}`);
      }
    } catch (error) {
      this.results.errors.push(`Initial load error: ${error.message}`);
    }
  }

  async testAuthentication() {
    console.log('Testing: Authentication...');
    try {
      const hasLoginForm = await this.page.locator('input[type="text"], input[type="email"], input[name*="user"]').count() > 0;
      
      if (hasLoginForm) {
        const usernameField = this.page.locator('input[type="text"], input[type="email"], input[name*="user"]').first();
        const passwordField = this.page.locator('input[type="password"]').first();
        
        await usernameField.fill(CREDENTIALS.username);
        await passwordField.fill(CREDENTIALS.password);
        
        await this.screenshot('02-before-login');
        
        const loginButton = this.page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();
        await loginButton.click();
        
        await this.page.waitForTimeout(2000);
        await this.screenshot('03-after-login');
        
        this.results.passed.push('Authentication attempted');
      } else {
        await this.screenshot('02-no-login-form');
        this.results.warnings.push('No login form detected, app may not require authentication');
      }
    } catch (error) {
      this.results.warnings.push(`Authentication test: ${error.message}`);
    }
  }

  async testDashboard() {
    console.log('Testing: Dashboard...');
    try {
      await this.page.waitForTimeout(1000);
      const title = await this.page.title();
      await this.screenshot('04-dashboard');
      
      const hasContent = await this.page.locator('body').textContent();
      if (hasContent.length > 100) {
        this.results.passed.push(`Dashboard loaded (title: ${title})`);
      } else {
        this.results.warnings.push('Dashboard appears empty');
      }
    } catch (error) {
      this.results.errors.push(`Dashboard error: ${error.message}`);
    }
  }

  async testSection(sectionName) {
    console.log(`Testing: ${sectionName} section...`);
    try {
      const navLink = this.page.locator(`a[href*="${sectionName}"], a:has-text("${sectionName}"), button:has-text("${sectionName}")`).first();
      
      if (await navLink.count() > 0) {
        await navLink.click();
        await this.page.waitForTimeout(1500);
        
        await this.screenshot(`05-section-${sectionName}`);
        
        const hasError = await this.page.locator('text=/error|failed|not found/i').count() > 0;
        if (hasError) {
          this.results.warnings.push(`${sectionName} section shows error message`);
        } else {
          this.results.passed.push(`${sectionName} section loaded`);
        }
      } else {
        await this.screenshot(`05-section-${sectionName}-not-found`);
        this.results.warnings.push(`${sectionName} section navigation not found`);
      }
    } catch (error) {
      this.results.errors.push(`${sectionName} section error: ${error.message}`);
    }
  }

  async testSafeDryRun() {
    console.log('Testing: Safe dry-run form...');
    try {
      const dryRunCheckbox = this.page.locator('input[name*="dry"], input[id*="dry"], input[type="checkbox"]:near(:has-text("dry run"))').first();
      
      if (await dryRunCheckbox.count() > 0) {
        await dryRunCheckbox.check();
        await this.screenshot('06-dry-run-form');
        
        const submitButton = this.page.locator('button[type="submit"]:near(input[name*="dry"])').first();
        if (await submitButton.count() > 0) {
          await submitButton.click();
          await this.page.waitForTimeout(2000);
          await this.screenshot('07-dry-run-result');
          this.results.passed.push('Dry-run form submission completed');
        } else {
          this.results.warnings.push('Dry-run checkbox found but no submit button nearby');
        }
      } else {
        this.results.warnings.push('No safe dry-run form found (skipped for safety)');
      }
    } catch (error) {
      this.results.warnings.push(`Dry-run test: ${error.message}`);
    }
  }

  generateReport() {
    const report = `
╔════════════════════════════════════════════════════════════════════╗
║           SMOKE TEST REPORT - Domain Admin Panel                   ║
╚════════════════════════════════════════════════════════════════════╝

Timestamp: ${this.results.timestamp}
Application URL: ${BASE_URL}

SUMMARY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Passed:   ${this.results.passed.length}
⚠️  Warnings: ${this.results.warnings.length}
❌ Errors:   ${this.results.errors.length}

DETAILED RESULTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ PASSED:
${this.results.passed.map(p => `  • ${p}`).join('\n') || '  (none)'}

⚠️  WARNINGS:
${this.results.warnings.map(w => `  • ${w}`).join('\n') || '  (none)'}

❌ ERRORS:
${this.results.errors.map(e => `  • ${e}`).join('\n') || '  (none)'}

CONSOLE ERRORS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${this.results.consoleErrors.slice(0, 10).map(e => `  ${e}`).join('\n') || '  (none)'}
${this.results.consoleErrors.length > 10 ? `  ... and ${this.results.consoleErrors.length - 10} more` : ''}

API ERRORS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${this.results.apiErrors.slice(0, 10).map(e => `  ${e}`).join('\n') || '  (none)'}
${this.results.apiErrors.length > 10 ? `  ... and ${this.results.apiErrors.length - 10} more` : ''}

SCREENSHOTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${this.results.screenshots.map(s => `  • ${s}`).join('\n')}

OVERALL ASSESSMENT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${this.results.errors.length === 0 ? '✅ PASS - No critical errors detected' : '❌ FAIL - Critical errors found'}

${this.results.warnings.length > 0 ? `\nNOTE: ${this.results.warnings.length} warning(s) detected - review recommended` : ''}

All screenshots saved to: ${SCREENSHOTS_DIR}/
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    return report;
  }

  async run() {
    console.log('Starting smoke test...\n');
    
    try {
      await this.setup();
      
      await this.testInitialLoad();
      await this.testAuthentication();
      await this.testDashboard();
      
      for (const section of SECTIONS) {
        await this.testSection(section);
      }
      
      await this.testSafeDryRun();
      
      const report = this.generateReport();
      console.log(report);
      
      fs.writeFileSync('./smoke-test-report.txt', report);
      fs.writeFileSync('./smoke-test-results.json', JSON.stringify(this.results, null, 2));
      
      console.log('\n✅ Test complete! Results saved to:');
      console.log('  • smoke-test-report.txt');
      console.log('  • smoke-test-results.json');
      console.log(`  • ${SCREENSHOTS_DIR}/`);
      
    } catch (error) {
      console.error('Fatal error:', error);
      this.results.errors.push(`Fatal error: ${error.message}`);
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
}

(async () => {
  const runner = new SmokeTestRunner();
  await runner.run();
})();
