import { SetMetadata } from '@nestjs/common';
import { ModuleKey } from '@prisma/client';

export const REQUIRES_MODULE_KEY = 'requiresModule';

/** Bloqueia a rota (403) quando o plano do tenant não inclui este módulo. Combine com ModulesGuard. */
export const RequiresModule = (moduleKey: ModuleKey) => SetMetadata(REQUIRES_MODULE_KEY, moduleKey);
