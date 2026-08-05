// Valores dummy para que módulos que leem env em tempo de import/construção
// (ex.: PrismaClient, validação de config) não quebrem rodando testes unitários
// isolados, sem precisar de um .env real ou banco de dados.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://erp:erp@localhost:5432/erp_test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
process.env.CUSTOMER_JWT_ACCESS_SECRET = process.env.CUSTOMER_JWT_ACCESS_SECRET || 'test-customer-access-secret';
process.env.CUSTOMER_JWT_ACCESS_EXPIRES_IN = process.env.CUSTOMER_JWT_ACCESS_EXPIRES_IN || '30m';
process.env.CUSTOMER_JWT_REFRESH_SECRET = process.env.CUSTOMER_JWT_REFRESH_SECRET || 'test-customer-refresh-secret';
process.env.CUSTOMER_JWT_REFRESH_EXPIRES_IN = process.env.CUSTOMER_JWT_REFRESH_EXPIRES_IN || '30d';
process.env.TENANT_HEADER = process.env.TENANT_HEADER || 'x-tenant-slug';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
process.env.API_PORT = process.env.API_PORT || '3001';
