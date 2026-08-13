# Roadmap

Tudo abaixo está entregue e em uso. A lista fica como registro da ordem em que
o sistema foi construído — cada fase depende da anterior.

- [x] **Fundação**: estrutura multi-tenant, autenticação, painel administrativo.
- [x] **Núcleo comercial**: clientes, produtos, estoque, fornecedores.
- [x] **Vendas e financeiro**: PDV, caixa, contas a pagar/receber, fiado.
- [x] **Oficina**: orçamento (com aprovação pública por link), ordem de serviço, veículos do cliente.
- [x] **Fiscal**: NF-e/NFC-e via Focus NFe (cai em simulado sem token configurado).
- [x] **WhatsApp e automação**: inbox, chatbot, motor de automações genérico.
- [x] **Relatórios e BI**: dashboard gerencial, metas, exportação.
- [x] **SaaS**: planos, módulos por plano, cobrança recorrente, onboarding self-service, super-admin.
- [x] **Operação**: backup verificado, e-mail, HTTPS automático, monitoramento, CI e testes de ponta a ponta.

Houve também uma fase de **e-commerce** (loja virtual, carrinho, checkout,
expedição). Ela foi removida do produto — o que sobrou dela e continua valendo
é a aprovação de orçamento por link público, hoje servida pelo próprio painel
em `/aprovar/[token]`.
