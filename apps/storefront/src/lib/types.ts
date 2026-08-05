export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface TenantBranding {
  name: string | null;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string | null;
}

export interface PublicProduct {
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
  retailPrice: string;
  wholesalePrice: string;
  isActive: boolean;
  inStock: boolean;
  reviewsCount?: number;
  averageRating?: number | null;
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  customer: { name: string };
}

export type AddressType = 'SHIPPING' | 'BILLING';

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
  name: string;
  email: string | null;
  phone: string | null;
  priceTier: 'RETAIL' | 'WHOLESALE';
}

export type PaymentMethod = 'CASH' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'PIX' | 'BOLETO';
export type SaleStatus = 'QUOTE' | 'CONFIRMED' | 'CANCELED' | 'RETURNED';

export interface OrderItem {
  id: string;
  productId: string;
  product?: { name: string; sku: string };
  quantity: number;
  unitPrice: string;
  total: string;
}

export interface OrderPayment {
  id: string;
  method: PaymentMethod;
  installments: number;
  amount: string;
}

export type ShipmentStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED';

export interface ShipmentEvent {
  id: string;
  status: ShipmentStatus;
  note: string | null;
  createdAt: string;
}

export interface Shipment {
  carrier: string | null;
  trackingCode: string | null;
  status: ShipmentStatus;
  events?: ShipmentEvent[];
}

export type InvoiceStatus = 'PENDING' | 'ISSUED' | 'CANCELED' | 'ERROR';

export interface Invoice {
  type: 'NFE' | 'NFCE';
  status: InvoiceStatus;
  accessKey: string | null;
}

export interface Order {
  id: string;
  status: SaleStatus;
  channel: 'STORE' | 'ONLINE';
  subtotal: string;
  discount: string;
  shippingCost: string;
  total: string;
  createdAt: string;
  items: OrderItem[];
  payments: OrderPayment[];
  shippingAddress?: CustomerAddress | null;
  shipment?: Shipment | null;
  invoice?: Invoice | null;
}

export interface FreightEstimate {
  cost: number;
  estimatedDays: number;
  totalWeightKg: number;
}
