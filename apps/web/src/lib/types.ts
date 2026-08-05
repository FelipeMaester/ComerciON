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

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
}

export type CustomerType = 'INDIVIDUAL' | 'COMPANY';
export type CustomerSegment = 'NEW' | 'RECURRING' | 'VIP' | 'DELINQUENT';
export type PriceTier = 'RETAIL' | 'WHOLESALE';
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

export interface Customer {
  id: string;
  type: CustomerType;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  segment: CustomerSegment;
  priceTier: PriceTier;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  addresses?: CustomerAddress[];
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
  retailPrice: string;
  wholesalePrice: string;
  minStock: number;
  isActive: boolean;
  createdAt: string;
  stockItems?: StockItem[];
  totalQuantity?: number;
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
  productId: string;
  product?: Product;
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
export type ShipmentStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED';

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

export interface ShipmentEvent {
  id: string;
  status: ShipmentStatus;
  note: string | null;
  createdAt: string;
}

export interface Shipment {
  id: string;
  saleId: string;
  carrier: string | null;
  trackingCode: string | null;
  status: ShipmentStatus;
  shippedAt: string | null;
  deliveredAt: string | null;
  events?: ShipmentEvent[];
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
  channel?: SaleChannel;
  shippingAddress?: CustomerAddress | null;
  subtotal: string;
  discount: string;
  shippingCost?: string;
  total: string;
  notes: string | null;
  confirmedAt: string | null;
  createdAt: string;
  items: SaleItem[];
  payments: SalePayment[];
  invoice?: Invoice | null;
  shipment?: Shipment | null;
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

export interface DashboardSummary {
  today: PeriodStats;
  month: PeriodStats;
  topProducts: TopProduct[];
  abcCurve: AbcCurveItem[];
  goal: SalesGoalSummary;
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
  paidAt: string | null;
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

export interface TenantSettings {
  name: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string | null;
}
