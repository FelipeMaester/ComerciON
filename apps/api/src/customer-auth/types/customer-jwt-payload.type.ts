export interface CustomerJwtPayload {
  sub: string;
  tenantId: string;
  email: string;
}

export type AuthenticatedCustomer = CustomerJwtPayload;
