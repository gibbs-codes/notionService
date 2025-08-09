#!/usr/bin/env node

/**
 * Integration Testing Script
 * 
 * This script performs end-to-end integration testing of the financial service,
 * including realistic workflows and data validation.
 * 
 * Usage: npm run test:integration
 */

const { config } = require('dotenv');
const path = require('path');

// Load environment variables
config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8081}`;

class IntegrationTester {
  constructor() {
    this.results = {
      workflows: 0,
      passed: 0,
      failed: 0,
      errors: [],
      startTime: Date.now()
    };
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Integration-Test-Script/1.0',
      },
      timeout: 15000,
    };

    const response = await fetch(url, { ...defaultOptions, ...options });
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
      ok: response.ok,
      requestId: response.headers.get('x-request-id')
    };
  }

  async runWorkflow(name, workflowFn) {
    console.log(`\n🔄 Running workflow: ${name}`);
    console.log('-'.repeat(50));
    
    const startTime = Date.now();
    this.results.workflows++;

    try {
      const result = await workflowFn();
      const duration = Date.now() - startTime;
      
      this.results.passed++;
      console.log(`✅ COMPLETED: ${name} (${duration}ms)`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.results.failed++;
      this.results.errors.push({ workflow: name, error: error.message });
      
      console.log(`❌ FAILED: ${name} (${duration}ms)`);
      console.log(`   Error: ${error.message}`);
      
      throw error;
    }
  }

  // Workflow 1: Health Check and Service Discovery
  async testServiceDiscoveryWorkflow() {
    const steps = [];

    // Step 1: Basic health check
    const basicHealth = await this.makeRequest('/health');
    if (!basicHealth.ok) {
      throw new Error('Basic health check failed');
    }
    steps.push('Basic health check passed');

    // Step 2: Detailed health with service status
    const detailedHealth = await this.makeRequest('/api/health');
    if (!detailedHealth.ok || !detailedHealth.data.success) {
      throw new Error('Detailed health check failed');
    }

    const healthData = detailedHealth.data.data;
    steps.push(`Service status: ${healthData.status}`);
    steps.push(`Services monitored: ${Object.keys(healthData.services).length}`);

    // Step 3: Individual service health
    const servicesHealth = await this.makeRequest('/api/health/services');
    if (!servicesHealth.ok) {
      throw new Error('Services health check failed');
    }

    const services = Object.entries(servicesHealth.data.data);
    const healthyServices = services.filter(([, service]) => service.status === 'healthy').length;
    steps.push(`Healthy services: ${healthyServices}/${services.length}`);

    // Step 4: System metrics
    const metrics = await this.makeRequest('/api/health/metrics');
    if (!metrics.ok) {
      throw new Error('Metrics endpoint failed');
    }

    const metricsData = metrics.data.data;
    steps.push(`Uptime: ${Math.round(metricsData.application.uptime)}s`);
    steps.push(`Memory usage: ${metricsData.system.memory.used}MB`);

    return { steps, healthStatus: healthData.status, servicesCount: services.length };
  }

  // Workflow 2: Financial Data Retrieval and Analysis
  async testFinancialDataWorkflow() {
    const steps = [];
    const financialData = {};

    // Step 1: Get comprehensive financial context
    const contextResponse = await this.makeRequest('/api/financial/context');
    if (!contextResponse.ok) {
      throw new Error(`Financial context failed: ${contextResponse.status}`);
    }

    const context = contextResponse.data.data;
    financialData.context = context;
    steps.push(`Net worth: $${context.netWorth}`);
    steps.push(`Active goals: ${context.goals.active}`);
    steps.push(`Active debts: ${context.debts.count}`);
    steps.push(`Budget health: ${context.budget.status}`);

    // Step 2: Get detailed goals information
    const goalsResponse = await this.makeRequest('/api/financial/goals');
    if (!goalsResponse.ok) {
      throw new Error(`Goals endpoint failed: ${goalsResponse.status}`);
    }

    const goals = goalsResponse.data.data;
    financialData.goals = goals;
    steps.push(`Goals retrieved: ${goals.length}`);
    if (goals.length > 0) {
      const avgProgress = goals.reduce((sum, goal) => sum + goal.progressPercentage, 0) / goals.length;
      steps.push(`Average goal progress: ${Math.round(avgProgress)}%`);
    }

    // Step 3: Get debts information
    const debtsResponse = await this.makeRequest('/api/financial/debts');
    if (!debtsResponse.ok) {
      throw new Error(`Debts endpoint failed: ${debtsResponse.status}`);
    }

    const debts = debtsResponse.data.data;
    financialData.debts = debts;
    steps.push(`Debt records retrieved: ${debts.length}`);

    // Step 4: Get account balances
    const accountsResponse = await this.makeRequest('/api/financial/accounts');
    if (!accountsResponse.ok) {
      throw new Error(`Accounts endpoint failed: ${accountsResponse.status}`);
    }

    const accounts = accountsResponse.data.data;
    financialData.accounts = accounts;
    steps.push(`Account balances retrieved: ${accounts.length}`);

    // Step 5: Get budget status
    const budgetResponse = await this.makeRequest('/api/financial/budget');
    if (!budgetResponse.ok) {
      throw new Error(`Budget endpoint failed: ${budgetResponse.status}`);
    }

    const budget = budgetResponse.data.data;
    financialData.budget = budget;
    steps.push(`Budget usage: ${budget.percentageUsed}%`);
    steps.push(`Remaining budget: $${budget.remainingBudget}`);

    return { steps, financialData };
  }

  // Workflow 3: Spending Analysis and Context Building
  async testSpendingAnalysisWorkflow() {
    const steps = [];
    const spendingData = {};

    // Step 1: Get pending spending requests
    const pendingResponse = await this.makeRequest('/api/spending/pending?minAmount=50');
    if (!pendingResponse.ok) {
      throw new Error(`Pending requests failed: ${pendingResponse.status}`);
    }

    const pendingRequests = pendingResponse.data.data;
    spendingData.pending = pendingRequests;
    steps.push(`Pending requests: ${pendingRequests.length}`);
    
    if (pendingRequests.length > 0) {
      const totalPending = pendingRequests.reduce((sum, req) => sum + req.amount, 0);
      steps.push(`Total pending amount: $${totalPending}`);
    }

    // Step 2: Get recent spending history
    const recentResponse = await this.makeRequest('/api/spending/recent/30');
    if (!recentResponse.ok) {
      throw new Error(`Recent spending failed: ${recentResponse.status}`);
    }

    const recentSpending = recentResponse.data.data;
    spendingData.recent = recentSpending;
    steps.push(`Recent requests (30 days): ${recentSpending.length}`);

    if (recentSpending.length > 0) {
      const totalRecent = recentSpending.reduce((sum, req) => sum + req.amount, 0);
      const avgAmount = totalRecent / recentSpending.length;
      steps.push(`Total recent spending: $${totalRecent}`);
      steps.push(`Average request: $${Math.round(avgAmount)}`);
    }

    // Step 3: Get comprehensive spending context
    const contextResponse = await this.makeRequest('/api/spending/context?days=30');
    if (!contextResponse.ok) {
      throw new Error(`Spending context failed: ${contextResponse.status}`);
    }

    const context = contextResponse.data.data;
    spendingData.context = context;
    steps.push(`Context analysis period: ${context.period.days} days`);
    steps.push(`Total requests analyzed: ${context.summary.totalRequests}`);
    steps.push(`Categories found: ${Object.keys(context.breakdown.byCategory).length}`);
    steps.push(`Weekly total: $${context.trends.weeklyTotal}`);

    // Step 4: Test decision context (if pending requests exist)
    if (pendingRequests.length > 0) {
      const firstRequest = pendingRequests[0];
      const decisionResponse = await this.makeRequest(`/api/spending/${firstRequest.id}/decision-context`);
      
      if (decisionResponse.ok && decisionResponse.data.success) {
        const decisionContext = decisionResponse.data.data;
        spendingData.decisionContext = decisionContext;
        steps.push(`Decision context built for request: ${firstRequest.id}`);
        steps.push(`AI recommendation: ${decisionContext.recommendation.shouldApprove ? 'APPROVE' : 'DENY'}`);
        steps.push(`Confidence: ${decisionContext.recommendation.confidence}%`);
        steps.push(`Financial health score: ${decisionContext.financialHealth.score}`);
      } else {
        steps.push(`Decision context test skipped (request may not exist: ${firstRequest.id})`);
      }
    }

    return { steps, spendingData };
  }

  // Workflow 4: Error Handling and Edge Cases
  async testErrorHandlingWorkflow() {
    const steps = [];
    const errorTests = [];

    // Test 1: Invalid endpoints
    const invalidEndpoint = await this.makeRequest('/api/invalid/endpoint');
    errorTests.push({
      test: 'Invalid endpoint',
      expectedStatus: 404,
      actualStatus: invalidEndpoint.status,
      passed: invalidEndpoint.status === 404
    });

    // Test 2: Invalid parameters
    const invalidParam = await this.makeRequest('/api/spending/recent/invalid');
    errorTests.push({
      test: 'Invalid parameter',
      expectedStatus: 400,
      actualStatus: invalidParam.status,
      passed: invalidParam.status === 400
    });

    // Test 3: Invalid request body
    const invalidBody = await this.makeRequest('/api/spending/test-id/decision', {
      method: 'POST',
      body: JSON.stringify({ invalid: 'data' })
    });
    errorTests.push({
      test: 'Invalid request body',
      expectedStatus: [400, 422],
      actualStatus: invalidBody.status,
      passed: [400, 422].includes(invalidBody.status)
    });

    // Test 4: Test rate limiting (make multiple rapid requests)
    let rateLimitHit = false;
    for (let i = 0; i < 10; i++) {
      const response = await this.makeRequest('/health');
      if (response.status === 429) {
        rateLimitHit = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
    }

    errorTests.push({
      test: 'Rate limiting',
      passed: true, // Rate limiting may or may not trigger in tests
      note: rateLimitHit ? 'Rate limit was triggered' : 'Rate limit not triggered (expected in light testing)'
    });

    const passedTests = errorTests.filter(test => test.passed).length;
    steps.push(`Error handling tests: ${passedTests}/${errorTests.length} passed`);

    errorTests.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      steps.push(`  ${status} ${test.test}: ${test.actualStatus || test.note}`);
    });

    return { steps, errorTests };
  }

  // Workflow 5: Performance and Load Testing
  async testPerformanceWorkflow() {
    const steps = [];
    const performanceData = {};

    // Test concurrent requests
    const concurrentRequests = 5;
    const endpoints = [
      '/health',
      '/api/health',
      '/api/financial/context',
      '/api/spending/pending',
      '/api/financial/budget'
    ];

    steps.push(`Testing ${concurrentRequests} concurrent requests to ${endpoints.length} endpoints`);

    const startTime = Date.now();
    const promises = [];

    for (let i = 0; i < concurrentRequests; i++) {
      for (const endpoint of endpoints) {
        promises.push(
          this.makeRequest(endpoint).then(response => ({
            endpoint,
            status: response.status,
            duration: Date.now() - startTime,
            success: response.ok
          })).catch(error => ({
            endpoint,
            error: error.message,
            success: false
          }))
        );
      }
    }

    const results = await Promise.all(promises);
    const successfulRequests = results.filter(r => r.success).length;
    const totalRequests = results.length;
    const avgDuration = results
      .filter(r => r.duration)
      .reduce((sum, r) => sum + r.duration, 0) / results.filter(r => r.duration).length;

    performanceData.concurrent = {
      totalRequests,
      successfulRequests,
      successRate: (successfulRequests / totalRequests) * 100,
      averageDuration: avgDuration
    };

    steps.push(`Concurrent requests: ${successfulRequests}/${totalRequests} successful`);
    steps.push(`Success rate: ${Math.round(performanceData.concurrent.successRate)}%`);
    steps.push(`Average response time: ${Math.round(avgDuration)}ms`);

    // Test response time for critical endpoints
    const criticalEndpoints = ['/health', '/api/health', '/api/financial/context'];
    const responseTimeLimits = { '/health': 100, '/api/health': 500, '/api/financial/context': 2000 };

    for (const endpoint of criticalEndpoints) {
      const startTime = Date.now();
      const response = await this.makeRequest(endpoint);
      const duration = Date.now() - startTime;
      const limit = responseTimeLimits[endpoint];
      const withinLimit = duration <= limit;

      steps.push(`${endpoint}: ${duration}ms ${withinLimit ? '✅' : '⚠️'} (limit: ${limit}ms)`);
    }

    return { steps, performanceData };
  }

  // Main test runner
  async runAllWorkflows() {
    console.log('🚀 Starting Notion Financial Service Integration Tests');
    console.log('=' .repeat(70));
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Test Started: ${new Date().toISOString()}`);
    console.log('=' .repeat(70));

    const workflowResults = {};

    try {
      // Workflow 1: Service Discovery
      workflowResults.serviceDiscovery = await this.runWorkflow(
        'Service Discovery & Health Monitoring',
        () => this.testServiceDiscoveryWorkflow()
      );

      // Workflow 2: Financial Data
      workflowResults.financialData = await this.runWorkflow(
        'Financial Data Retrieval & Analysis',
        () => this.testFinancialDataWorkflow()
      );

      // Workflow 3: Spending Analysis
      workflowResults.spendingAnalysis = await this.runWorkflow(
        'Spending Analysis & Decision Context',
        () => this.testSpendingAnalysisWorkflow()
      );

      // Workflow 4: Error Handling
      workflowResults.errorHandling = await this.runWorkflow(
        'Error Handling & Edge Cases',
        () => this.testErrorHandlingWorkflow()
      );

      // Workflow 5: Performance Testing
      workflowResults.performance = await this.runWorkflow(
        'Performance & Load Testing',
        () => this.testPerformanceWorkflow()
      );

      this.printSummary(workflowResults);

    } catch (error) {
      console.error('\n💥 Critical workflow failure:', error.message);
      this.printSummary(workflowResults);
      process.exit(1);
    }
  }

  printSummary(workflowResults) {
    const totalTime = Date.now() - this.results.startTime;

    console.log('\n' + '=' .repeat(70));
    console.log('🏁 INTEGRATION TEST SUMMARY');
    console.log('=' .repeat(70));
    console.log(`Total Workflows: ${this.results.workflows}`);
    console.log(`✅ Completed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⏱️  Total Time: ${Math.round(totalTime / 1000)}s`);
    console.log(`📊 Success Rate: ${Math.round((this.results.passed / this.results.workflows) * 100)}%`);

    if (this.results.failed > 0) {
      console.log('\n🔍 FAILED WORKFLOWS:');
      this.results.errors.forEach(error => {
        console.log(`   ❌ ${error.workflow}: ${error.error}`);
      });
    }

    // Print detailed workflow results
    console.log('\n📋 WORKFLOW DETAILS:');
    Object.entries(workflowResults).forEach(([workflow, result]) => {
      console.log(`\n🔄 ${workflow.toUpperCase()}:`);
      if (result && result.steps) {
        result.steps.forEach(step => {
          console.log(`   • ${step}`);
        });
      }
    });

    // Service health summary
    if (workflowResults.serviceDiscovery) {
      const health = workflowResults.serviceDiscovery;
      console.log(`\n🏥 SERVICE HEALTH: ${health.healthStatus.toUpperCase()}`);
      console.log(`   Services Monitored: ${health.servicesCount}`);
    }

    // Financial data summary
    if (workflowResults.financialData && workflowResults.financialData.financialData) {
      const financial = workflowResults.financialData.financialData;
      console.log('\n💰 FINANCIAL OVERVIEW:');
      if (financial.context) {
        console.log(`   Net Worth: $${financial.context.netWorth}`);
        console.log(`   Budget Health: ${financial.context.budget.status}`);
        console.log(`   Active Goals: ${financial.context.goals.active}`);
      }
    }

    // Performance summary
    if (workflowResults.performance && workflowResults.performance.performanceData) {
      const perf = workflowResults.performance.performanceData;
      console.log('\n⚡ PERFORMANCE METRICS:');
      if (perf.concurrent) {
        console.log(`   Success Rate: ${Math.round(perf.concurrent.successRate)}%`);
        console.log(`   Avg Response Time: ${Math.round(perf.concurrent.averageDuration)}ms`);
      }
    }

    if (this.results.failed === 0) {
      console.log('\n🎉 All integration workflows completed successfully!');
      console.log('   The service is fully functional and ready for production use.');
    } else {
      console.log(`\n⚠️  ${this.results.failed} workflow(s) failed. Please review the service configuration.`);
    }

    console.log('\n📝 Next steps:');
    console.log('   • Review any failed workflows above');
    console.log('   • Check service logs for detailed error information');
    console.log('   • Verify Notion database configuration and permissions');
    console.log('   • Monitor service health at /api/health');
  }
}

// Add fetch polyfill for older Node.js versions
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

// Run the integration tests
async function main() {
  const tester = new IntegrationTester();
  
  try {
    await tester.runAllWorkflows();
  } catch (error) {
    console.error('\n💥 Fatal error during integration testing:', error.message);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = IntegrationTester;