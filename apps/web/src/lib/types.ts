export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'SALES' | 'FINANCE' | 'INVENTORY' | 'SUPPORT';

export interface AppUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserProfile extends AppUser {
  tenantName: string;
}

export interface TwoFactorSecret {
  secret: string;
  otpauthUrl: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
}

export type CustomerType = 'INDIVIDUAL' | 'COMPANY';
export type CustomerSegment = 'NEW' | 'RECURRING' | 'VIP' | 'DELINQUENT';
export type AddressType = 'SHIPPING' | 'BILLING';
export type StockMovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'LOSS';

export interface CustomerAddress {
  id: string;
  type: AddressType;
  street: string;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
}

export interface CustomerVehicle {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
}

export interface Customer {
  id: string;
  type: CustomerType;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  segment: CustomerSegment;
  notes: string | null;
  isActive: boolean;
  paymentTermDays: number | null;
  creditLimit: string | null;
  tags: string[];
  createdAt: string;
  addresses?: CustomerAddress[];
  vehicles?: CustomerVehicle[];
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Warehouse {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface StockItem {
  id: string;
  quantity: number;
  warehouse: Warehouse;
}

export type StockCountStatus = 'OPEN' | 'COMPLETED' | 'CANCELED';

export interface StockCountItem {
  id: string;
  productId: string;
  product: { id: string; name: string; sku: string; barcode: string | null };
  expectedQty: number;
  countedQty: number | null;
}

export interface StockCount {
  id: string;
  warehouseId: string;
  warehouse: { id: string; name: string };
  status: StockCountStatus;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  items: StockCountItem[];
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  vehicleApplication: string | null;
  categoryId: string | null;
  category?: Category | null;
  unit: string;
  costPrice: string;
  price: string;
  minStock: number;
  isActive: boolean;
  createdAt: string;
  stockItems?: StockItem[];
  totalQuantity?: number;
}

export interface ProductEquivalent {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  price: string;
  vehicleApplication: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  productLinks?: { id: string; productId: string; supplierSku: string | null; cost: string; isPreferred: boolean; product: Product }[];
}

export type SaleStatus = 'QUOTE' | 'CONFIRMED' | 'CANCELED' | 'RETURNED';
export type PaymentMethod = 'CASH' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'PIX' | 'BOLETO';
export type FinancialEntryType = 'PAYABLE' | 'RECEIVABLE';
export type FinancialEntryStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED';

export interface SaleItem {
  id: string;
  productId: string | null;
  product?: Product | null;
  description?: string | null;
  quantity: number;
  unitPrice: string;
  discount: string;
  total: string;
}

export interface SalePayment {
  id: string;
  method: PaymentMethod;
  installments: number;
  amount: string;
}

export type SaleChannel = 'STORE' | 'ONLINE';
export type InvoiceType = 'NFE' | 'NFCE';
export type InvoiceStatus = 'PENDING' | 'ISSUED' | 'CANCELED' | 'ERROR';
export interface InvoiceCorrection {
  id: string;
  text: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  saleId: string;
  type: InvoiceType;
  status: InvoiceStatus;
  accessKey: string | null;
  series: string | null;
  number: string | null;
  xmlContent: string | null;
  cancelReason: string | null;
  issuedAt: string | null;
  canceledAt: string | null;
  corrections?: InvoiceCorrection[];
}

export interface Sale {
  id: string;
  customerId: string | null;
  customer?: Customer | null;
  sellerId: string | null;
  seller?: AppUser | null;
  warehouseId: string;
  warehouse?: Warehouse;
  status: SaleStatus;
  subtotal: string;
  discount: string;
  shippingCost?: string;
  cardFeeAmount?: string;
  total: string;
  notes: string | null;
  confirmedAt: string | null;
  createdAt: string;
  items: SaleItem[];
  payments: SalePayment[];
  invoice?: Invoice | null;
}

export interface FinancialEntry {
  id: string;
  type: FinancialEntryType;
  description: string;
  category: string | null;
  amount: string;
  dueDate: string;
  paidAt: string | null;
  status: FinancialEntryStatus;
  isOverdue?: boolean;
  customerId: string | null;
  customer?: Customer | null;
  supplierId: string | null;
  supplier?: Supplier | null;
  saleId: string | null;
  createdAt: string;
}

export interface CashFlowSummary {
  from: string;
  to: string;
  previsto: { receitas: number; despesas: number; saldo: number };
  realizado: { receitas: number; despesas: number; saldo: number };
}

export type ConversationStatus = 'OPEN' | 'PENDING' | 'CLOSED';
export type MessageDirection = 'INBOUND' | 'OUTBOUND';
export type MessageSender = 'CUSTOMER' | 'BOT' | 'AGENT' | 'SYSTEM';
export type AutomationType = 'ORDER_CONFIRMATION' | 'SHIPPING_UPDATE' | 'PAYMENT_REMINDER' | 'ABANDONED_CART';

export interface Message {
  id: string;
  direction: MessageDirection;
  sender: MessageSender;
  content: string;
  automationType: AutomationType | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  phoneNumber: string;
  status: ConversationStatus;
  customer?: Customer | null;
  assignedUser?: { id: string; name: string } | null;
  lastMessageAt: string;
  messages?: Message[];
}

export interface PeriodStats {
  from: string;
  to: string;
  total: number;
  count: number;
  averageTicket: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  total: number;
}

export type AbcClass = 'A' | 'B' | 'C';

export interface AbcCurveItem {
  productId: string;
  name: string;
  sku: string;
  revenue: number;
  cumulativePct: number;
  class: AbcClass;
}

export interface SalesGoalSummary {
  month: string;
  targetAmount: number | null;
  actualAmount: number;
  progressPct: number | null;
}

export interface DashboardPipelineSummary {
  openCount: number;
  openValue: number;
  staleCount: number;
  staleOpportunities: Opportunity[];
}

export interface DashboardTasksSummary {
  overdueCount: number;
  todayCount: number;
  overdueTasks: Task[];
}

export interface DashboardSummary {
  today: PeriodStats;
  month: PeriodStats;
  topProducts: TopProduct[];
  abcCurve: AbcCurveItem[];
  goal: SalesGoalSummary;
  pipeline: DashboardPipelineSummary;
  tasks: DashboardTasksSummary;
}

export interface PeriodComparison {
  periodA: PeriodStats;
  periodB: PeriodStats;
  revenueChangePct: number | null;
  salesCountChangePct: number | null;
}

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
export type SubscriptionInvoiceStatus = 'PENDING' | 'PAID' | 'FAILED';
export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELED';

export interface Plan {
  id: string;
  key: string;
  name: string;
  priceMonthly: string;
  modules: string[];
}

export interface SubscriptionInvoice {
  id: string;
  amount: string;
  status: SubscriptionInvoiceStatus;
  periodStart: string;
  periodEnd: string;
  /** Vencimento da cobrança, que não é o fim do período de serviço. */
  dueDate: string | null;
  paidAt: string | null;
  /** Onde o cliente paga (boleto/PIX/cartão). Null no provedor simulado. */
  paymentUrl: string | null;
  createdAt: string;
}

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  plan: Plan;
  invoices?: SubscriptionInvoice[];
}

export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: string;
  subscription?: Subscription | null;
  _count?: { users: number };
}

export type QuoteStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ServiceOrderStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELED';

export interface QuoteItem {
  id: string;
  productId: string | null;
  product?: { id: string; name: string; sku: string } | null;
  description: string;
  quantity: number;
  unitPrice: string;
}

export interface Quote {
  id: string;
  customerId: string;
  customer?: Customer | { id: string; name: string; email: string | null; phone: string | null };
  vehicleId: string | null;
  vehicle?: CustomerVehicle | { plate: string } | null;
  opportunityId: string | null;
  description: string | null;
  status: QuoteStatus;
  publicToken: string;
  total: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  items: QuoteItem[];
  serviceOrder?: {
    id: string;
    status: ServiceOrderStatus;
    scheduledAt: string | null;
    sale?: { id: string; status: SaleStatus; total: string; payments: { amount: string }[] } | null;
  } | null;
}

export interface ServiceOrderItem {
  id: string;
  productId: string | null;
  product?: { id: string; name: string; sku: string } | null;
  description: string;
  quantity: number;
  unitPrice: string;
}

export interface ServiceOrder {
  id: string;
  quoteId: string | null;
  quote?: { id: string; status: QuoteStatus } | null;
  saleId: string | null;
  sale?: { id: string; status: SaleStatus } | null;
  customerId: string;
  customer?: Customer | { id: string; name: string };
  vehicleId: string | null;
  vehicle?: CustomerVehicle | { plate: string } | null;
  description: string | null;
  status: ServiceOrderStatus;
  total: string;
  scheduledAt: string | null;
  createdAt: string;
  items: ServiceOrderItem[];
}

export interface TenantSettings {
  name: string;
  /** CNPJ — impresso no cabeçalho do cupom. */
  document?: string | null;
  phone?: string | null;
  addressLine?: string | null;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  logoPosition: string | null;
  bannerPosition: string | null;
  primaryColor: string | null;
  cardFeeRates: number[] | null;
}

/**
 * O que o cliente vê na página pública de aprovação do orçamento. Veio da
 * loja virtual junto com a página, quando a loja foi removida.
 */
export interface PublicQuoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: string;
  product?: { name: string; sku: string } | null;
}

export interface PublicQuote {
  id: string;
  status: QuoteStatus;
  description: string | null;
  total: string;
  createdAt: string;
  customer: { name: string };
  vehicle?: { plate: string; brand: string | null; model: string | null } | null;
  items: PublicQuoteItem[];
  serviceOrder?: { id: string; status: string } | null;
}

export type CouponDiscountType = 'PERCENTAGE' | 'FIXED';

export interface Coupon {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  value: string;
  freeShipping: boolean;
  minOrderValue: string | null;
  validFrom: string | null;
  validUntil: string | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  isWonStage: boolean;
  isLostStage: boolean;
}

export type OpportunityStatus = 'OPEN' | 'WON' | 'LOST';

export interface Opportunity {
  id: string;
  customerId: string;
  customer?: { id: string; name: string; phone: string | null; email: string | null };
  stageId: string;
  stage?: PipelineStage | { id: string; name: string; isWonStage: boolean; isLostStage: boolean };
  title: string;
  estimatedValue: string | null;
  status: OpportunityStatus;
  responsibleId: string | null;
  responsible?: { id: string; name: string } | null;
  source: string | null;
  tags: string[];
  lostReason: string | null;
  wonAt: string | null;
  lostAt: string | null;
  stageChangedAt: string;
  createdAt: string;
}

// Gatilhos e ações continuam tipados aqui só para o TypeScript ajudar no
// autocomplete. Os RÓTULOS e os campos de formulário NÃO vivem mais no
// frontend: vêm de GET /automation-rules/catalog (ver AutomationCatalog
// abaixo). Antes eram duplicados à mão, e um gatilho novo no backend
// aparecia como "undefined" na tela até alguém lembrar de editar aqui.
/** Módulos de negócio que um plano pode incluir (espelha o enum do Prisma). */
export type ModuleKey =
  | 'CRM'
  | 'INVENTORY'
  | 'SUPPLIERS'
  | 'SALES'
  | 'FINANCE'
  | 'ECOMMERCE'
  | 'FISCAL'
  | 'LOGISTICS'
  | 'WHATSAPP'
  | 'MARKETING'
  | 'BI'
  // 'AI' continua no enum do banco por compatibilidade com planos já
  // cadastrados, mas nenhuma tela depende dele: o chat foi removido e as
  // sugestões de automação rodam no motor de regras.
  | 'AI'
  | 'AUTOMATIONS';

/** Resposta de GET /billing/my-modules — o que o menu usa para se montar. */
export interface TenantModules {
  modules: ModuleKey[];
  planName: string | null;
  canceled: boolean;
}

/**
 * Envelope de toda listagem paginada da API.
 *
 * Antes as listas devolviam um array cru e a tela renderizava tudo — o PDV
 * chegava a baixar o catálogo inteiro por abertura de caixa. Agora vêm sempre
 * assim, e `total` é o que permite mostrar "página 1 de 12".
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---- Caixa (frente de loja) ----

export type CashSessionStatus = 'OPEN' | 'CLOSED';
/** WITHDRAWAL = sangria (sai da gaveta), DEPOSIT = suprimento (entra). */
export type CashMovementType = 'WITHDRAWAL' | 'DEPOSIT';

export interface CashSummary {
  openingAmount: number;
  /** Só o que entrou em dinheiro — é o que estará fisicamente na gaveta. */
  cashSales: number;
  /** Cartão, pix e boleto das vendas da sessão: não entram na conferência. */
  nonCashSales: number;
  deposits: number;
  withdrawals: number;
  expectedAmount: number;
  salesCount: number;
}

export interface CashMovement {
  id: string;
  type: CashMovementType;
  amount: string;
  reason: string;
  createdAt: string;
  user?: { name: string };
}

export interface CashSession {
  id: string;
  status: CashSessionStatus;
  openingAmount: string;
  openedAt: string;
  countedAmount: string | null;
  expectedAmount: string | null;
  difference: string | null;
  closingNotes: string | null;
  closedAt: string | null;
  operator?: { id: string; name: string };
  movements?: CashMovement[];
  summary?: CashSummary;
}

export type AutomationTrigger =
  | 'QUOTE_PENDING_DAYS'
  | 'OPPORTUNITY_STALE_DAYS'
  | 'SALE_CONFIRMED'
  | 'OPPORTUNITY_WON'
  | 'OPPORTUNITY_LOST'
  | 'CUSTOMER_INACTIVE_DAYS'
  | 'LOW_STOCK'
  | 'RECEIVABLE_OVERDUE_DAYS'
  | 'SERVICE_ORDER_STALE_DAYS';
export type AutomationAction = 'SEND_WHATSAPP' | 'CREATE_TASK';
export type AutomationEntityType =
  | 'QUOTE'
  | 'OPPORTUNITY'
  | 'SALE'
  | 'CUSTOMER'
  | 'PRODUCT'
  | 'FINANCIAL_ENTRY'
  | 'SERVICE_ORDER';

/** Um campo de configuração que a tela renderiza a partir do catálogo. */
export interface CatalogField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'textarea' | 'user';
  required: boolean;
  defaultValue?: string | number;
  help?: string;
  min?: number;
}

export interface CatalogTrigger {
  value: AutomationTrigger;
  label: string;
  description: string;
  kind: 'scheduled' | 'event';
  entityType: AutomationEntityType;
  hasCustomer: boolean;
  fields: CatalogField[];
}

export interface CatalogAction {
  value: AutomationAction;
  label: string;
  description: string;
  contactsCustomer: boolean;
  fields: CatalogField[];
}

export interface AutomationCatalog {
  triggers: CatalogTrigger[];
  actions: CatalogAction[];
}

export interface AutomationRuleStats {
  runCount: number;
  failureCount: number;
  lastFiredAt: string | null;
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  triggerConfig: { days?: number } | null;
  action: AutomationAction;
  actionConfig: Record<string, string | undefined>;
  cooldownDays: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Vem de GET /automation-rules (a listagem); ausente no GET por id. */
  stats?: AutomationRuleStats;
}

export interface AutomationRunLog {
  id: string;
  entityType: AutomationEntityType;
  entityId: string;
  firedAt: string;
  success: boolean;
  error: string | null;
}

export interface AutomationSuggestion {
  id: string;
  name: string;
  /** O número concreto que motivou a sugestão — é o que o usuário lê pra decidir. */
  rationale: string;
  trigger: AutomationTrigger;
  triggerConfig: { days?: number } | null;
  action: AutomationAction;
  actionConfig: Record<string, string | undefined>;
  generatedAt: string;
}

export interface AutomationSuggestionsResponse {
  suggestions: AutomationSuggestion[];
  generatedAt: string | null;
  isStale: boolean;
  skipped?: string;
}

export type TaskStatus = 'PENDING' | 'DONE' | 'CANCELED';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: TaskStatus;
  completedAt: string | null;
  assignedToId: string;
  assignedTo?: { id: string; name: string };
  createdById: string;
  createdBy?: { id: string; name: string };
  customerId: string | null;
  customer?: { id: string; name: string } | null;
  opportunityId: string | null;
  opportunity?: { id: string; title: string } | null;
  createdAt: string;
  updatedAt: string;
}
