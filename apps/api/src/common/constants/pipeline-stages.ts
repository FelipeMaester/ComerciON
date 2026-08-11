// Etapas padrão do funil de vendas — toda empresa nova (registro self-service
// ou seed de demonstração) nasce com estas 7 etapas, na mesma ordem. Usado
// tanto por AuthService.registerTenant() quanto por prisma/seed.ts.
export const DEFAULT_PIPELINE_STAGES = [
  { name: 'Novo Lead', order: 1 },
  { name: 'Em contato', order: 2 },
  { name: 'Qualificado', order: 3 },
  { name: 'Orçamento', order: 4 },
  { name: 'Negociação', order: 5 },
  { name: 'Ganho', order: 6, isWonStage: true },
  { name: 'Perdido', order: 7, isLostStage: true },
] as const;
