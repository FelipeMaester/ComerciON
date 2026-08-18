-- Como a identidade da loja aparece no menu e no cupom impresso.
--
-- Um campo só, e não um por lugar: a loja que carregou um logotipo com o nome
-- escrito dentro dele não quer o nome repetido ao lado — nem no menu, nem no
-- papel que o cliente leva.
--
-- O padrão reproduz exatamente o que o sistema já fazia antes desta coluna
-- existir (logo e nome juntos), então nenhuma loja existente muda de aparência
-- ao aplicar esta migration.
ALTER TABLE "tenants" ADD COLUMN "brandDisplay" TEXT DEFAULT 'logo_e_nome';
