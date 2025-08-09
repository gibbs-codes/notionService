#!/usr/bin/env node

/**
 * Health Check Testing Script
 * 
 * This script tests all API endpoints, validates Notion connectivity,
 * checks database access, and tests error handling scenarios.
 * 
 * Usage: npm run test:health
 */

const { config } = require('dotenv');
const path = require('path');

// Load environment variables
config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8081}`;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const SPENDING_DATABASE_ID = process.env.SPENDING_DATABASE_ID;

class HealthTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      errors: [],
      tests: []
    };
    this.startTime = Date.now();
  }

  async runTest(name, testFn) {
    const testStart = Date.now();
    
    try {
      console.log(`\n🧪 Testing: ${name}`);
      const result = await testFn();
      const duration = Date.now() - testStart;
      
      this.results.passed++;
      this.results.tests.push({
        name,
        status: 'PASSED',
        duration,
        result
      });
      
      console.log(`✅ PASSED: ${name} (${duration}ms)`);
      if (result && typeof result === 'object') {
        console.log(`   Response:`, JSON.stringify(result, null, 2).substring(0, 200) + '...');
      }
    } catch (error) {
      const duration = Date.now() - testStart;
      
      this.results.failed++;
      this.results.errors.push({ name, error: error.message });
      this.results.tests.push({
        name,
        status: 'FAILED',
        duration,
        error: error.message
      });
      
      console.log(`❌ FAILED: ${name} (${duration}ms)`);
      console.log(`   Error: ${error.message}`);
    }
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Health-Test-Script/1.0',
      },
      timeout: 10000, // 10 second timeout
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    try {
      const response = await fetch(url, finalOptions);
      const contentType = response.headers.get('content-type');
      
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data,
        ok: response.ok
      };
    } catch (error) {
      throw new Error(`Request failed: ${error.message}`);
    }
  }

  // Basic connectivity tests
  async testBasicHealth() {
    const response = await this.makeRequest('/health');
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
    }

    if (!response.data.status || response.data.status !== 'healthy') {
      throw new Error('Health check returned non-healthy status');
    }

    return response.data;
  }

  async testDetailedHealth() {
    const response = await this.makeRequest('/api/health');
    
    if (!response.ok) {
      throw new Error(`Detailed health check failed: ${response.status} ${response.statusText}`);
    }

    if (!response.data.success) {
      throw new Error('Detailed health check returned success: false');
    }

    const healthData = response.data.data;
    
    // Validate required fields
    const requiredFields = ['status', 'version', 'environment', 'uptime', 'services'];
    for (const field of requiredFields) {
      if (!(field in healthData)) {
        throw new Error(`Missing required field in health data: ${field}`);
      }
    }

    // Validate services
    const requiredServices = ['notionClient', 'spendingService', 'financialDataService'];
    for (const service of requiredServices) {
      if (!(service in healthData.services)) {
        throw new Error(`Missing required service in health data: ${service}`);
      }
    }

    return healthData;
  }

  async testServicesHealth() {
    const response = await this.makeRequest('/api/health/services');
    
    if (!response.ok) {
      throw new Error(`Services health check failed: ${response.status} ${response.statusText}`);
    }

    if (!response.data.success) {
      throw new Error('Services health check returned success: false');
    }

    const servicesData = response.data.data;
    const services = Object.keys(servicesData);
    
    if (services.length === 0) {
      throw new Error('No services found in health check');
    }

    // Check each service has required status
    for (const [serviceName, serviceData] of Object.entries(servicesData)) {
      if (!serviceData.status) {
        throw new Error(`Service ${serviceName} missing status`);
      }
      
      if (!['healthy', 'degraded', 'unhealthy'].includes(serviceData.status)) {
        throw new Error(`Service ${serviceName} has invalid status: ${serviceData.status}`);
      }
    }

    return servicesData;
  }

  async testMetrics() {
    const response = await this.makeRequest('/api/health/metrics');
    
    if (!response.ok) {
      throw new Error(`Metrics endpoint failed: ${response.status} ${response.statusText}`);
    }

    if (!response.data.success) {
      throw new Error('Metrics endpoint returned success: false');
    }

    const metricsData = response.data.data;
    
    // Validate required sections
    const requiredSections = ['system', 'application', 'notion', 'cache'];
    for (const section of requiredSections) {
      if (!(section in metricsData)) {
        throw new Error(`Missing required metrics section: ${section}`);
      }
    }

    return metricsData;
  }

  // API endpoint tests
  async testSpendingEndpoints() {
    const tests = [];

    // Test pending requests
    try {
      const response = await this.makeRequest('/api/spending/pending');
      tests.push({ endpoint: '/api/spending/pending', status: response.status, success: response.data.success });
    } catch (error) {
      tests.push({ endpoint: '/api/spending/pending', error: error.message });
    }

    // Test recent spending with valid parameter
    try {
      const response = await this.makeRequest('/api/spending/recent/30');
      tests.push({ endpoint: '/api/spending/recent/30', status: response.status, success: response.data.success });
    } catch (error) {
      tests.push({ endpoint: '/api/spending/recent/30', error: error.message });
    }

    // Test spending context
    try {
      const response = await this.makeRequest('/api/spending/context');
      tests.push({ endpoint: '/api/spending/context', status: response.status, success: response.data.success });
    } catch (error) {
      tests.push({ endpoint: '/api/spending/context', error: error.message });
    }

    return tests;
  }

  async testFinancialEndpoints() {
    const tests = [];

    // Test financial context
    try {
      const response = await this.makeRequest('/api/financial/context');
      tests.push({ endpoint: '/api/financial/context', status: response.status, success: response.data.success });
    } catch (error) {
      tests.push({ endpoint: '/api/financial/context', error: error.message });
    }

    // Test goals endpoint
    try {
      const response = await this.makeRequest('/api/financial/goals');
      tests.push({ endpoint: '/api/financial/goals', status: response.status, success: response.data.success });
    } catch (error) {
      tests.push({ endpoint: '/api/financial/goals', error: error.message });
    }

    // Test debts endpoint
    try {
      const response = await this.makeRequest('/api/financial/debts');
      tests.push({ endpoint: '/api/financial/debts', status: response.status, success: response.data.success });
    } catch (error) {
      tests.push({ endpoint: '/api/financial/debts', error: error.message });
    }

    // Test accounts endpoint
    try {
      const response = await this.makeRequest('/api/financial/accounts');
      tests.push({ endpoint: '/api/financial/accounts', status: response.status, success: response.data.success });
    } catch (error) {
      tests.push({ endpoint: '/api/financial/accounts', error: error.message });
    }

    // Test budget endpoint
    try {
      const response = await this.makeRequest('/api/financial/budget');
      tests.push({ endpoint: '/api/financial/budget', status: response.status, success: response.data.success });
    } catch (error) {
      tests.push({ endpoint: '/api/financial/budget', error: error.message });
    }

    return tests;
  }

  // Error handling tests
  async testErrorHandling() {
    const tests = [];

    // Test 404 handling
    try {
      const response = await this.makeRequest('/api/nonexistent');
      if (response.status !== 404) {
        throw new Error(`Expected 404, got ${response.status}`);
      }
      tests.push({ test: '404 handling', status: 'PASSED' });
    } catch (error) {
      tests.push({ test: '404 handling', status: 'FAILED', error: error.message });
    }

    // Test invalid parameter handling
    try {
      const response = await this.makeRequest('/api/spending/recent/invalid');
      if (response.status !== 400) {
        throw new Error(`Expected 400 for invalid parameter, got ${response.status}`);
      }
      tests.push({ test: 'Invalid parameter handling', status: 'PASSED' });
    } catch (error) {
      tests.push({ test: 'Invalid parameter handling', status: 'FAILED', error: error.message });
    }

    // Test invalid decision update
    try {
      const response = await this.makeRequest('/api/spending/invalid-id/decision', {
        method: 'POST',
        body: JSON.stringify({ decision: 'Invalid', reasoning: 'Test' })
      });
      if (![400, 404, 422].includes(response.status)) {
        throw new Error(`Expected 400/404/422 for invalid decision, got ${response.status}`);
      }
      tests.push({ test: 'Invalid decision handling', status: 'PASSED' });
    } catch (error) {
      tests.push({ test: 'Invalid decision handling', status: 'FAILED', error: error.message });
    }

    return tests;
  }

  // Notion connectivity validation
  async testNotionConnectivity() {
    if (!NOTION_TOKEN) {
      throw new Error('NOTION_TOKEN not configured');
    }

    if (!SPENDING_DATABASE_ID) {
      throw new Error('SPENDING_DATABASE_ID not configured');
    }

    // Test basic Notion API connectivity
    try {
      const response = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Notion API returned ${response.status}: ${response.statusText}`);
      }

      const userData = await response.json();
      return {
        status: 'connected',
        user: userData.name || userData.id,
        type: userData.type
      };
    } catch (error) {
      throw new Error(`Failed to connect to Notion API: ${error.message}`);
    }
  }

  async testDatabaseAccess() {
    if (!NOTION_TOKEN || !SPENDING_DATABASE_ID) {
      throw new Error('Notion configuration missing');
    }

    try {
      const response = await fetch(`https://api.notion.com/v1/databases/${SPENDING_DATABASE_ID}`, {
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Database access failed: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const databaseData = await response.json();
      return {
        status: 'accessible',
        title: databaseData.title?.[0]?.plain_text || 'Unknown',
        properties: Object.keys(databaseData.properties || {}).length
      };
    } catch (error) {
      throw new Error(`Failed to access spending database: ${error.message}`);
    }
  }

  // Cache management test
  async testCacheManagement() {
    const response = await this.makeRequest('/api/health/cache/clear', {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(`Cache clear failed: ${response.status} ${response.statusText}`);
    }

    if (!response.data.success) {
      throw new Error('Cache clear returned success: false');
    }

    return response.data.data;
  }

  // Main test runner
  async runAllTests() {
    console.log('🚀 Starting Notion Financial Service Health Tests');
    console.log('=' .repeat(60));
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Notion Token: ${NOTION_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    console.log(`Spending Database: ${SPENDING_DATABASE_ID ? '✅ Configured' : '❌ Missing'}`);
    console.log('=' .repeat(60));

    // Basic health tests
    await this.runTest('Basic Health Check', () => this.testBasicHealth());
    await this.runTest('Detailed Health Check', () => this.testDetailedHealth());
    await this.runTest('Services Health Check', () => this.testServicesHealth());
    await this.runTest('Metrics Endpoint', () => this.testMetrics());

    // Notion connectivity tests
    if (NOTION_TOKEN && SPENDING_DATABASE_ID) {
      await this.runTest('Notion API Connectivity', () => this.testNotionConnectivity());
      await this.runTest('Database Access', () => this.testDatabaseAccess());
    } else {
      console.log('\n⚠️  Skipping Notion connectivity tests (missing configuration)');
    }

    // API endpoint tests
    await this.runTest('Spending Endpoints', () => this.testSpendingEndpoints());
    await this.runTest('Financial Endpoints', () => this.testFinancialEndpoints());

    // Error handling tests
    await this.runTest('Error Handling', () => this.testErrorHandling());

    // Cache management test
    await this.runTest('Cache Management', () => this.testCacheManagement());

    this.printSummary();
  }

  printSummary() {
    const totalTime = Date.now() - this.startTime;
    const total = this.results.passed + this.results.failed;

    console.log('\n' + '=' .repeat(60));
    console.log('🏁 TEST SUMMARY');
    console.log('=' .repeat(60));
    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⏱️  Total Time: ${totalTime}ms`);
    console.log(`📊 Success Rate: ${Math.round((this.results.passed / total) * 100)}%`);

    if (this.results.failed > 0) {
      console.log('\n🔍 FAILED TESTS:');
      this.results.errors.forEach(error => {
        console.log(`   ❌ ${error.name}: ${error.error}`);
      });
    }

    console.log('\n📋 DETAILED RESULTS:');
    this.results.tests.forEach(test => {
      const status = test.status === 'PASSED' ? '✅' : '❌';
      console.log(`   ${status} ${test.name} (${test.duration}ms)`);
      if (test.error) {
        console.log(`      Error: ${test.error}`);
      }
    });

    if (this.results.failed === 0) {
      console.log('\n🎉 All tests passed! The service is healthy and ready.');
    } else {
      console.log(`\n⚠️  ${this.results.failed} test(s) failed. Please check the service configuration.`);
      process.exit(1);
    }
  }
}

// Add fetch polyfill for older Node.js versions
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

// Run the tests
async function main() {
  const tester = new HealthTester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('\n💥 Fatal error during testing:', error.message);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = HealthTester;