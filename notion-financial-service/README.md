# Notion Financial Service

A comprehensive TypeScript/Node.js service for managing financial data through Notion APIs with intelligent spending decision analysis and AI-powered recommendations.

## 🚀 Features

### 🏗️ Architecture
- **Production-ready Fastify server** with comprehensive error handling
- **Service-oriented architecture** with dependency injection
- **Comprehensive middleware** for logging, CORS, rate limiting, and validation
- **Zod-based validation** for all API requests and responses
- **OpenAPI documentation** with Swagger UI (development mode)

### 📊 Financial Services
- **Spending Request Management** - Track and analyze spending requests with intelligent categorization
- **Financial Goals Tracking** - Monitor progress toward financial objectives with automated calculations
- **Debt Management** - Track debts, payments, and payoff strategies with priority analysis
- **Account Balance Monitoring** - Monitor multiple account balances across different types
- **Budget Analysis** - Monthly budget tracking with health indicators and recommendations
- **Decision Context** - AI-powered spending decision recommendations with confidence scoring

### 🔧 Technical Features
- **Notion API Integration** with retry logic, rate limiting, and caching
- **Comprehensive Error Handling** with custom error types and HTTP status mapping
- **Request Tracing** with unique request IDs for debugging
- **Health Monitoring** with detailed service health checks
- **Graceful Shutdown** handling for production deployments
- **TypeScript Strict Mode** with comprehensive type safety

## 📋 Quick Start

### Prerequisites
- Node.js 18+ 
- Notion account with API access
- Notion databases set up (see [Database Setup](#-notion-database-setup))

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd notion-financial-service

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your Notion credentials (see Configuration section)

# Development
npm run dev

# Production build
npm run build
npm start
```

### Testing
```bash
# Run all tests
npm test

# Quick health check only
npm run test:health

# Full integration tests
npm run test:integration
```

## 🔧 Configuration

Create a `.env` file in the project root:

```env
# Notion Configuration (Required)
NOTION_TOKEN=your_notion_integration_token
SPENDING_DATABASE_ID=your_spending_database_id

# Optional Databases (Recommended)
GOALS_DATABASE_ID=your_goals_database_id
DEBTS_DATABASE_ID=your_debts_database_id
ACCOUNTS_DATABASE_ID=your_accounts_database_id

# Server Configuration
PORT=8081
NODE_ENV=development
LOG_LEVEL=info

# Testing Configuration
BASE_URL=http://localhost:8081
```

### Environment Variables
| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `NOTION_TOKEN` | ✅ | Notion integration token | - |
| `SPENDING_DATABASE_ID` | ✅ | Database ID for spending requests | - |
| `GOALS_DATABASE_ID` | ❌ | Database ID for financial goals | - |
| `DEBTS_DATABASE_ID` | ❌ | Database ID for debt tracking | - |
| `ACCOUNTS_DATABASE_ID` | ❌ | Database ID for account balances | - |
| `PORT` | ❌ | Server port | 8081 |
| `NODE_ENV` | ❌ | Environment mode | development |
| `LOG_LEVEL` | ❌ | Logging level | info |

## 🗄️ Notion Database Setup

### Required Database: Spending Requests
Create a Notion database with these properties:

| Property Name | Type | Description | Options |
|---------------|------|-------------|---------|
| `Title` | Title | Request description | - |
| `Amount` | Number | Request amount in USD | Currency: USD |
| `Description` | Rich Text | Detailed description | - |
| `Category` | Select | Spending category | Food, Entertainment, Shopping, Bills, Emergency, Other |
| `Status` | Select | Request status | Pending, Approved, Denied |
| `Request Date` | Date | When request was made | - |
| `Decision Date` | Date | When decision was made | - |
| `Reasoning` | Rich Text | Decision reasoning | - |
| `Urgency` | Select | Request urgency | Low, Medium, High, Critical |
| `Tags` | Multi-select | Additional tags | (flexible) |

### Optional Database: Financial Goals
| Property Name | Type | Description | Options |
|---------------|------|-------------|---------|
| `Title` | Title | Goal name | - |
| `Description` | Rich Text | Goal description | - |
| `Category` | Select | Goal type | emergency_fund, debt_payoff, savings, investment, other |
| `Target Amount` | Number | Target amount | Currency: USD |
| `Current Amount` | Number | Current progress | Currency: USD |
| `Target Date` | Date | Goal deadline | - |
| `Priority` | Select | Goal priority | low, medium, high, urgent |
| `Status` | Select | Goal status | active, completed, paused, cancelled |

### Optional Database: Debts
| Property Name | Type | Description | Options |
|---------------|------|-------------|---------|
| `Creditor` | Title | Creditor name | - |
| `Type` | Select | Debt type | credit_card, loan, mortgage, student_loan, other |
| `Original Amount` | Number | Original debt amount | Currency: USD |
| `Remaining Amount` | Number | Current balance | Currency: USD |
| `Interest Rate` | Number | Annual interest rate | Format: Percent |
| `Minimum Payment` | Number | Monthly minimum payment | Currency: USD |
| `Due Date` | Date | Payment due date | - |
| `Priority` | Select | Payment priority | low, medium, high, urgent |
| `Status` | Select | Debt status | active, paid_off, deferred |

### Optional Database: Account Balances
| Property Name | Type | Description | Options |
|---------------|------|-------------|---------|
| `Account Name` | Title | Account name | - |
| `Account Type` | Select | Account type | checking, savings, credit_card, investment, retirement, other |
| `Current Balance` | Number | Current balance | Currency: USD |
| `Currency` | Select | Account currency | USD (add others as needed) |
| `Last Updated` | Date | Last balance update | - |
| `Institution` | Rich Text | Bank/institution name | - |
| `Is Active` | Checkbox | Account is active | - |
| `Description` | Rich Text | Additional notes | - |

## 🌐 API Endpoints

### Health & Monitoring
- `GET /health` - Simple health check
- `GET /api/health` - Comprehensive health check with service details
- `GET /api/health/services` - Individual service health status  
- `GET /api/health/metrics` - Detailed system metrics and performance
- `POST /api/health/cache/clear` - Clear all service caches

### Spending Management
- `GET /api/spending/pending?minAmount=50` - Get pending spending requests
- `GET /api/spending/recent/:days` - Get recent spending history (1-365 days)
- `POST /api/spending/:id/decision` - Update spending request decision
- `GET /api/spending/context?days=30` - Get comprehensive spending analysis
- `GET /api/spending/:id/decision-context` - Get AI decision context for request

### Financial Data
- `GET /api/financial/context` - Complete financial overview
- `GET /api/financial/goals` - Active financial goals with progress tracking
- `GET /api/financial/debts` - Debt information with payoff calculations
- `GET /api/financial/accounts` - Account balances grouped by type
- `GET /api/financial/budget` - Current budget status with recommendations

## 💻 API Usage Examples

### Bash/cURL Examples

```bash
# Health check
curl http://localhost:8081/health

# Get comprehensive health status
curl http://localhost:8081/api/health

# Get pending spending requests
curl "http://localhost:8081/api/spending/pending?minAmount=100"

# Get recent spending (last 30 days)
curl http://localhost:8081/api/spending/recent/30

# Update spending decision
curl -X POST http://localhost:8081/api/spending/your-request-id/decision \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "Approved",
    "reasoning": "Emergency expense, well within budget"
  }'

# Get spending context and analysis
curl "http://localhost:8081/api/spending/context?days=30"

# Get financial overview
curl http://localhost:8081/api/financial/context

# Get financial goals
curl http://localhost:8081/api/financial/goals

# Get debt information
curl http://localhost:8081/api/financial/debts

# Get account balances
curl http://localhost:8081/api/financial/accounts

# Get budget status
curl http://localhost:8081/api/financial/budget

# Clear caches
curl -X POST http://localhost:8081/api/health/cache/clear
```

### JavaScript/Node.js Examples

```javascript
const BASE_URL = 'http://localhost:8081';

// Get pending spending requests
async function getPendingRequests(minAmount = 50) {
  const response = await fetch(`${BASE_URL}/api/spending/pending?minAmount=${minAmount}`);
  const data = await response.json();
  
  if (data.success) {
    console.log(`Found ${data.data.length} pending requests`);
    return data.data;
  } else {
    throw new Error(data.message);
  }
}

// Update a spending decision
async function updateSpendingDecision(requestId, decision, reasoning) {
  const response = await fetch(`${BASE_URL}/api/spending/${requestId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, reasoning })
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log(`Request ${requestId} ${decision.toLowerCase()}`);
    return data.data;
  } else {
    throw new Error(data.message);
  }
}

// Get comprehensive financial context
async function getFinancialOverview() {
  const response = await fetch(`${BASE_URL}/api/financial/context`);
  const data = await response.json();
  
  if (data.success) {
    const context = data.data;
    console.log(`Net Worth: $${context.netWorth}`);
    console.log(`Budget Status: ${context.budget.status}`);
    console.log(`Active Goals: ${context.goals.active}`);
    return context;
  } else {
    throw new Error(data.message);
  }
}

// Get AI decision context for a spending request
async function getDecisionContext(requestId) {
  const response = await fetch(`${BASE_URL}/api/spending/${requestId}/decision-context`);
  const data = await response.json();
  
  if (data.success) {
    const context = data.data;
    console.log(`AI Recommendation: ${context.recommendation.shouldApprove ? 'APPROVE' : 'DENY'}`);
    console.log(`Confidence: ${context.recommendation.confidence}%`);
    console.log(`Reasoning: ${context.recommendation.reasoning.join(', ')}`);
    return context;
  } else {
    throw new Error(data.message);
  }
}

// Usage examples
async function exampleWorkflow() {
  try {
    // 1. Get pending requests
    const pending = await getPendingRequests(100);
    
    // 2. Get financial overview
    const overview = await getFinancialOverview();
    
    // 3. For each pending request, get AI context
    for (const request of pending.slice(0, 3)) { // Just first 3
      const context = await getDecisionContext(request.id);
      
      // 4. Auto-approve low-risk requests
      if (context.recommendation.shouldApprove && context.recommendation.confidence > 80) {
        await updateSpendingDecision(
          request.id,
          'Approved',
          `Auto-approved: ${context.recommendation.reasoning.join(', ')}`
        );
      }
    }
    
  } catch (error) {
    console.error('Workflow failed:', error.message);
  }
}
```

### Python Examples

```python
import requests
import json

BASE_URL = 'http://localhost:8081'

def get_pending_requests(min_amount=50):
    """Get pending spending requests"""
    response = requests.get(f'{BASE_URL}/api/spending/pending?minAmount={min_amount}')
    data = response.json()
    
    if data['success']:
        print(f"Found {len(data['data'])} pending requests")
        return data['data']
    else:
        raise Exception(data['message'])

def update_spending_decision(request_id, decision, reasoning):
    """Update a spending decision"""
    response = requests.post(
        f'{BASE_URL}/api/spending/{request_id}/decision',
        json={'decision': decision, 'reasoning': reasoning}
    )
    data = response.json()
    
    if data['success']:
        print(f"Request {request_id} {decision.lower()}")
        return data['data']
    else:
        raise Exception(data['message'])

def get_financial_overview():
    """Get comprehensive financial context"""
    response = requests.get(f'{BASE_URL}/api/financial/context')
    data = response.json()
    
    if data['success']:
        context = data['data']
        print(f"Net Worth: ${context['netWorth']}")
        print(f"Budget Status: {context['budget']['status']}")
        print(f"Active Goals: {context['goals']['active']}")
        return context
    else:
        raise Exception(data['message'])

# Financial agent integration example
class FinancialAgent:
    def __init__(self, base_url=BASE_URL):
        self.base_url = base_url
    
    def analyze_spending_request(self, request_id):
        """Get AI analysis for a spending request"""
        response = requests.get(f'{self.base_url}/api/spending/{request_id}/decision-context')
        data = response.json()
        
        if data['success']:
            context = data['data']
            return {
                'should_approve': context['recommendation']['shouldApprove'],
                'confidence': context['recommendation']['confidence'],
                'reasoning': context['recommendation']['reasoning'],
                'financial_health': context['financialHealth']['score']
            }
        else:
            raise Exception(data['message'])
    
    def auto_process_requests(self, confidence_threshold=75):
        """Automatically process high-confidence requests"""
        pending = get_pending_requests()
        processed = 0
        
        for request in pending:
            analysis = self.analyze_spending_request(request['id'])
            
            if analysis['confidence'] >= confidence_threshold:
                decision = 'Approved' if analysis['should_approve'] else 'Denied'
                reasoning = f"Auto-processed (confidence: {analysis['confidence']}%): {', '.join(analysis['reasoning'])}"
                
                update_spending_decision(request['id'], decision, reasoning)
                processed += 1
        
        print(f"Auto-processed {processed} requests")
        return processed

# Usage
if __name__ == '__main__':
    agent = FinancialAgent()
    agent.auto_process_requests(confidence_threshold=80)
```

## 🧪 Testing

The service includes comprehensive testing infrastructure:

### Test Scripts
- `npm test` - Run all tests (health + integration)
- `npm run test:health` - Quick health check of all endpoints
- `npm run test:integration` - Full integration testing with workflows
- `npm run test:quick` - Alias for health test

### Test Features
- **API Endpoint Validation** - Tests all endpoints for proper responses
- **Notion Connectivity** - Validates Notion API access and database permissions
- **Error Handling** - Tests error scenarios and edge cases
- **Performance Testing** - Concurrent request testing and response time validation
- **Integration Workflows** - End-to-end testing of financial workflows

### Running Tests
```bash
# Quick health check (recommended for CI/CD)
npm run test:health

# Full integration test suite
npm run test:integration

# All tests with detailed reporting
npm test
```

## 🏗️ Architecture Overview

### Services Layer
- **NotionClient** - Low-level Notion API integration with caching and error handling
- **SpendingRequestService** - Business logic for spending request management  
- **FinancialDataService** - Financial goals, debts, and account management
- **DecisionContextService** - AI-powered spending decision analysis
- **NotionFinancialService** - Main orchestrator with dependency injection

### API Layer
- **Middleware** - Request logging, error handling, validation, rate limiting
- **Routes** - RESTful endpoints with comprehensive validation
- **Schemas** - Zod schemas for request/response validation
- **Error Handling** - Production-ready error responses with proper HTTP status codes

### Type Safety
- **Comprehensive Types** - Full TypeScript coverage with Zod validation
- **Strict Configuration** - `exactOptionalPropertyTypes` for maximum type safety
- **API Contracts** - Validated request/response schemas
- **Runtime Validation** - All inputs and outputs validated at runtime

## 📊 API Documentation

### Interactive Documentation
When running in development mode, visit **`http://localhost:8081/docs`** for interactive Swagger UI documentation with:
- Complete API specification
- Request/response examples
- Interactive testing interface
- Schema validation details

### API Response Format
All API responses follow a consistent format:

```typescript
// Success Response
{
  "success": true,
  "data": { /* response data */ },
  "message": "Optional success message",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "req_1234567890_abcdef"
}

// Error Response
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": { /* optional error details */ },
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "req_1234567890_abcdef"
}
```

## 🔍 Error Handling

The service provides comprehensive error handling with:

### Error Types
- **Validation Errors** (400) - Invalid request data
- **Authentication Errors** (401) - Invalid Notion token
- **Permission Errors** (403) - Insufficient Notion permissions
- **Not Found Errors** (404) - Resource or endpoint not found
- **Rate Limit Errors** (429) - API rate limits exceeded
- **Service Errors** (503) - External service unavailable

### Error Response Examples
```javascript
// Validation Error
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Invalid request data",
  "details": {
    "validationErrors": [
      {
        "field": "amount",
        "message": "Amount must be a positive number",
        "value": -100
      }
    ]
  }
}

// Notion API Error
{
  "success": false,
  "error": "NOTION_ERROR",
  "message": "External API error",
  "details": {
    "code": "unauthorized"
  }
}
```

## 📈 Monitoring & Observability

### Health Monitoring
- **Service Health Checks** with detailed status reporting
- **Individual Service Status** monitoring
- **System Metrics** including memory, CPU, and uptime
- **Notion API Metrics** including success rates and response times

### Logging
- **Structured Logging** with pino for high performance
- **Request Tracing** with unique request IDs
- **Performance Metrics** including request timing
- **Error Context** with full error details and stack traces

### Cache Management
- **Cache Statistics** including hit rates and evictions
- **Cache Health Monitoring** with size and TTL tracking
- **Manual Cache Management** via API endpoints

## 🚀 Production Deployment

### Environment Setup
```bash
# Production build
npm run build

# Start production server
NODE_ENV=production npm start
```

### Production Considerations
- Set `NODE_ENV=production` to disable debug features
- Configure proper logging levels (`LOG_LEVEL=info` or `warn`)
- Use process managers like PM2 or systemd
- Set up proper reverse proxy (nginx, Apache)
- Configure proper CORS settings for your domain
- Monitor health endpoints for service status

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 8081
CMD ["npm", "start"]
```

## 🤝 Integration Examples

### Financial Agent Integration
```typescript
import { NotionFinancialService } from './src/services';

class FinancialAgent {
  constructor(private financialService: NotionFinancialService) {}
  
  async autoProcessRequests() {
    const pending = await this.financialService.getPendingRequests();
    
    for (const request of pending) {
      const context = await this.financialService.buildDecisionContext(request.id);
      
      if (context.recommendation.confidence > 85) {
        const decision = context.recommendation.shouldApprove ? 'Approved' : 'Denied';
        await this.financialService.updateSpendingDecision(
          request.id,
          decision,
          `AI Auto-decision: ${context.recommendation.reasoning.join(', ')}`
        );
      }
    }
  }
}
```

### Webhook Integration
```typescript
// Express webhook endpoint example
app.post('/webhook/spending', async (req, res) => {
  const { requestId, type } = req.body;
  
  if (type === 'spending_request_created') {
    const context = await financialService.buildDecisionContext(requestId);
    
    // Send to Slack, Discord, etc.
    await sendNotification({
      title: `New Spending Request: $${context.request.amount}`,
      recommendation: context.recommendation.shouldApprove ? '✅ Approve' : '❌ Deny',
      confidence: `${context.recommendation.confidence}% confidence`,
      reasoning: context.recommendation.reasoning
    });
  }
  
  res.status(200).send('OK');
});
```

## 🔧 Development

### Prerequisites
- Node.js 18+
- TypeScript 5+
- Notion API access

### Development Commands
```bash
npm run dev        # Start development server with hot reload
npm run build      # Build TypeScript to JavaScript
npm run lint       # Run ESLint
npm run format     # Format code with Prettier
npm test           # Run all tests
```

### Project Structure
```
src/
├── api/                 # API layer
│   ├── middleware.ts    # Request handling middleware
│   ├── schemas.ts       # Zod validation schemas
│   └── routes/          # API route handlers
├── config/              # Configuration
│   ├── index.ts         # Environment config
│   └── logger.ts        # Logging configuration
├── services/            # Business logic services
│   ├── NotionClient.ts  # Notion API integration
│   ├── SpendingRequestService.ts
│   ├── FinancialDataService.ts
│   └── DecisionContextService.ts
├── types/               # TypeScript type definitions
└── index.ts             # Main server entry point
```

## 📄 License

MIT License - see LICENSE file for details.

---

## 🎯 Development Status

### ✅ Completed
- ✅ Complete service architecture implementation
- ✅ Comprehensive API endpoints with validation  
- ✅ Production-ready error handling and middleware
- ✅ Health monitoring and metrics
- ✅ TypeScript type definitions
- ✅ Notion API integration with caching
- ✅ Comprehensive testing infrastructure
- ✅ Complete documentation and examples

### 🔄 In Progress
- 🔄 TypeScript compilation fixes for `exactOptionalPropertyTypes`
- 🔄 Unit test implementation

### 📋 Future Enhancements
- 📋 WebSocket support for real-time updates
- 📋 Advanced AI decision algorithms
- 📋 Multi-currency support
- 📋 Advanced analytics and reporting

---

**Ready to transform your financial management with intelligent automation! 🚀**