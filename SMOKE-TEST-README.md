# Domain Admin Panel Smoke Test

## Quick Start

### Prerequisites
1. Ensure your web app is running at `http://localhost:3000`
2. Install Playwright: `npm install playwright`

### Run the Test
```bash
node smoke-test.js
```

The test will:
- Open a browser window (you can watch it run)
- Test all sections of the admin panel
- Take screenshots at each step
- Generate a detailed report

### Results
After completion, check:
- `smoke-test-report.txt` - Human-readable report
- `smoke-test-results.json` - Detailed JSON results
- `test-screenshots/` - Screenshots from the test run

## What It Tests

1. ✅ Initial app load
2. ✅ Authentication (if login form present)
3. ✅ Dashboard rendering
4. ✅ Navigation to all sections:
   - Users
   - Groups
   - Shares
   - Computers
   - OU (Organizational Units)
   - DNS
   - Servers
   - Jobs
5. ✅ Safe dry-run form submission (if available)

## Safety Features

- ⚠️ Only submits forms marked with "dry_run"
- ⚠️ No destructive operations
- ⚠️ Skips unsafe forms automatically
- ✅ Captures all console and API errors

## Customization

Edit these constants in `smoke-test.js`:

```javascript
const BASE_URL = 'http://localhost:3000';  // Change if different port
const CREDENTIALS = {
  username: 'admin',
  password: 'AdminPanel123!'
};
```

## Troubleshooting

**Browser doesn't open:**
- Install Playwright browsers: `npx playwright install`

**Connection refused:**
- Verify the app is running at localhost:3000
- Check if the port is correct

**Login fails:**
- Verify credentials are correct
- Check if the login form selectors need adjustment
