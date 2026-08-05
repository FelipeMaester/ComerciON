import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  email: string;
}

export type AuthenticatedUser = JwtPayload;
