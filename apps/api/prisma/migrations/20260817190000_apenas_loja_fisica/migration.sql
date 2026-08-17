-- Sistema opera só como loja física: a loja virtual saiu, e com ela os campos
-- que só existiam para montar a página inicial dela.
--
-- `tagline` e `description` eram o slogan e o texto "sobre a empresa" da home;
-- `bannerUrl`/`bannerPosition`, a imagem de capa. Nenhum dos quatro aparece em
-- cupom, ordem de serviço, nota fiscal ou no painel — só na vitrine que não
-- existe mais.
--
-- ATENÇÃO: derruba dado. A imagem do banner (data URI em base64) e os textos
-- não têm cópia em outra coluna; quem quiser guardá-los precisa fazer o dump
-- ANTES de aplicar esta migration.
ALTER TABLE "tenants"
  DROP COLUMN "tagline",
  DROP COLUMN "description",
  DROP COLUMN "bannerUrl",
  DROP COLUMN "bannerPosition";
