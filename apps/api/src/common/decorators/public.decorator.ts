import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca uma rota como acessível sem JWT (ex.: login, registro de tenant). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
