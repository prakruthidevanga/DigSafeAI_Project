import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOTS_DIR = path.resolve('..', 'ui_verification', 'playwright_evidence');

test.describe('DigSafeAI Application Suite', () => {

  test('01 - Authentication workflow (Login, Validation, and Session)', async ({ page }) => {
    // Navigate to /login
    await page.goto('/login');
    await expect(page).toHaveTitle(/DigSafe/i);

    // Verify brand card and typography
    await expect(page.locator('text=Underground Infrastructure Safety & AI Risk Screening')).toBeVisible();
    await expect(page.locator('text=Sign in to platform')).toBeVisible();

    // Verify invalid login handling
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await emailInput.fill('wrong@example.com');
    await passwordInput.fill('WrongPassword!');
    await submitBtn.click();
    await expect(page.locator('text=Invalid credentials')).toBeVisible();

    // Capture clean login page screenshot with valid demo user
    await emailInput.fill('demo@example.com');
    await passwordInput.fill('Password123!');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_login_page.png'), fullPage: true });

    // Login successfully
    await submitBtn.click();
    await page.waitForURL('**/dashboard');
    await expect(page.locator('h1').filter({ hasText: /Operational Overview/i })).toBeVisible();
  });

  test('02 - Dashboard overview & live metrics', async ({ page }) => {
    // Login with genuine demo user
    await page.goto('/login');
    await page.fill('input[type="email"]', 'demo@example.com');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    // Verify metric cards
    await expect(page.locator('text=TOTAL ASSESSMENTS')).toBeVisible();
    await expect(page.locator('text=CRITICAL HIGH RISK')).toBeVisible();
    await expect(page.locator('text=CONTROLLED MEDIUM RISK')).toBeVisible();
    await expect(page.locator('text=STANDARD LOW RISK')).toBeVisible();

    // Verify Subsurface Infrastructure Map
    await expect(page.locator('text=Bengaluru Subsurface Infrastructure Map')).toBeVisible();
    await expect(page.locator('.leaflet-container')).toBeVisible();

    // Verify Recent Excavation Assessments table
    await expect(page.locator('text=Recent Excavation Assessments')).toBeVisible();

    // Capture Dashboard screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_dashboard_overview.png'), fullPage: true });
  });

  test('03 - Map & Analysis 5-Stage Workflow (Isolated Test Runner)', async ({ page }) => {
    // Login with dedicated isolated testrunner user so demo baseline metrics are not polluted
    await page.goto('/login');
    await page.fill('input[type="email"]', 'testrunner@digsafe.ai');
    await page.fill('input[type="password"]', 'TestRunner123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    // Direct client navigation to Map & Analysis
    await page.goto('/map-analysis');
    await page.waitForURL('**/map-analysis');

    // Verify stepper navigation container
    const stepper = page.locator('.stepper-nav');
    await expect(stepper).toBeVisible();
    await expect(stepper.locator('.step-tab').nth(0)).toContainText('Location');
    await expect(stepper.locator('.step-tab').nth(1)).toContainText('Underground Utilities');
    await expect(stepper.locator('.step-tab').nth(2)).toContainText('Site Image');
    await expect(stepper.locator('.step-tab').nth(3)).toContainText('Sensor Monitoring');
    await expect(stepper.locator('.step-tab').nth(4)).toContainText('Risk Assessment');

    // Select Cubbon Park Preset
    const cubbonBtn = page.locator('button', { hasText: /Cubbon Park/i });
    await expect(cubbonBtn).toBeVisible();
    await cubbonBtn.click();
    await page.waitForTimeout(500);

    // Step 1: Click "CONTINUE TO UNDERGROUND UTILITIES"
    const continueBtn = page.locator('button.btn-primary', { hasText: /CONTINUE TO UNDERGROUND UTILITIES/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Verify Step 2 reached (Utilities Analysis)
    await expect(page.locator('text=Step 2: Mapped Underground Utility Analysis')).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_step2_utilities.png'), fullPage: true });

    // Step 2 -> Step 3: Click "CONTINUE TO SITE IMAGE"
    const toImageBtn = page.locator('button', { hasText: /CONTINUE TO SITE IMAGE/i });
    await toImageBtn.click();

    // Step 3 -> Step 4: Skip image and continue to Sensor Monitoring
    await expect(page.locator('text=Step 3: Optional Site Image Inspection')).toBeVisible();
    const toSensorsBtn = page.locator('button', { hasText: /CONTINUE TO SENSOR MONITORING/i });
    await toSensorsBtn.click();

    // Step 4: Verify Telemetry Simulation
    await expect(page.locator('text=Step 4: Subsurface Environmental Sensor Monitoring')).toBeVisible();
    
    // Click Generate Sensor Readings
    const genSensorBtn = page.locator('button', { hasText: /GENERATE SENSOR TELEMETRY/i });
    await expect(genSensorBtn).toBeVisible();
    await genSensorBtn.click();
    await page.waitForTimeout(600);

    // Verify sensor cards are rendered using exact class
    await expect(page.locator('.sensor-card-label', { hasText: 'Surface Vibration' })).toBeVisible();
    await expect(page.locator('.sensor-card-label', { hasText: 'Acoustic Noise' })).toBeVisible();
    await expect(page.locator('.sensor-card-label', { hasText: 'Soil Moisture' })).toBeVisible();
    await expect(page.locator('.sensor-card-label', { hasText: 'Soil Temperature' })).toBeVisible();
    await expect(page.locator('.sensor-card-label', { hasText: 'Gas Detection' })).toBeVisible();
    await expect(page.locator('.sensor-card-label', { hasText: 'Ground Movement' })).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_step4_sensors.png'), fullPage: true });

    // Step 4 -> Step 5: Continue to Risk Assessment
    const toRiskBtn = page.locator('button', { hasText: /CONTINUE TO RISK ASSESSMENT/i });
    await toRiskBtn.click();

    // Step 5: Review Parameters & Run Safety Assessment
    await expect(page.locator('text=Step 5: Review Parameters & Run Safety Assessment')).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_step5_parameters.png'), fullPage: true });

    // Start Analysis
    const startAnalysisBtn = page.locator('button', { hasText: /START EXCAVATION SAFETY ANALYSIS/i });
    await startAnalysisBtn.click();

    // Verification of navigation to Risk Result
    await page.waitForURL('**/risk-result/**', { timeout: 25000 });
    await expect(page.locator('text=Overall Excavation Hazard Level')).toBeVisible();
    await expect(page.locator('text=/ 100')).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_risk_result_from_analysis.png'), fullPage: true });
  });

  test('04 - Reports Management, Filtering & Disposable Deletion', async ({ page }) => {
    // Login with dedicated testrunner user
    await page.goto('/login');
    await page.fill('input[type="email"]', 'testrunner@digsafe.ai');
    await page.fill('input[type="password"]', 'TestRunner123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    // Direct client navigation to Reports
    await page.goto('/reports');
    await page.waitForURL('**/reports');

    // Verify header and filters
    await expect(page.locator('text=Excavation Safety Reports')).toBeVisible();
    const searchInput = page.locator('input[placeholder*="Search reports by site location"]');
    await expect(searchInput).toBeVisible();

    // Filter by HIGH risk via select dropdown
    const riskSelect = page.locator('select').first();
    await riskSelect.selectOption('HIGH');
    await page.waitForTimeout(300);

    // Filter by ALL
    await riskSelect.selectOption('ALL');
    await page.waitForTimeout(300);

    // Search for Cubbon
    await searchInput.fill('Cubbon');
    await page.waitForTimeout(300);

    // Capture Reports screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_reports_management.png'), fullPage: true });

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(300);

    // Verify view report navigation
    const openBtn = page.locator('button', { hasText: /Open/i }).first();
    await expect(openBtn).toBeVisible();
    await openBtn.click();
    await page.waitForURL('**/risk-result/**');

    // Risk Result verification
    await expect(page.locator('text=Overall Excavation Hazard Level')).toBeVisible();
    await expect(page.locator('text=Required Field Safety Precautions')).toBeVisible();
    await expect(page.locator('text=Subsurface Environmental Telemetry')).toBeVisible();

    // Capture Risk Result screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_risk_result_detailed.png'), fullPage: true });

    // Return to Reports to cleanly delete this disposable test assessment
    await page.goto('/reports');
    await page.waitForSelector('table.reports-table tbody tr');
    
    // Automatically accept the native browser confirmation dialog
    page.on('dialog', dialog => dialog.accept());
    
    // Click delete on the disposable report created during Test 03
    const deleteBtn = page.locator('table.reports-table tbody tr button', { hasText: /Delete/i }).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await page.waitForTimeout(600);
    }
  });

});
