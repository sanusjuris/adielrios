# Revisão de segurança: Sistema Modo Deus

Data: 21/10/2026. Base revisada: `5dcacd5f23b9d59329ba0ada52743f544eb45c43`, commit de 12/04/2026. Repositório: sanusjuris/adielrios. Nenhuma PR aberta foi encontrada no início da revisão. Escopo: código principal, arquitetura proposta e testes locais; não houve teste de credenciais, publicações, disparos, cobrança de APIs ou alteração de produção.

## Achados e tratamento

| Classificação | Achado | Tratamento nesta proposta |
|---|---|---|
| Confirmado, crítico | Usuário/senha fixos e chave com formato Google API no HTML público | Removidos da versão proposta. Exigem rotação independente do merge. |
| Confirmado, alto | Login e sessão decididos pelo navegador | Verificação de senha com scrypt no servidor; sessão aleatória, cookie HttpOnly/Secure/SameSite, expiração por inatividade em 30 minutos e absoluta em 8 horas, logout e rotação de sessão. |
| Confirmado, alto | Tokens de integrações persistidos no perfil e localStorage | Credenciais somente nas variáveis protegidas do servidor; formulário de segredos desabilitado; limpeza dos locais legados conhecidos. |
| Confirmado, alto | Exportação JSON omitia algumas credenciais da lista de ocultação | Exportação e persistência de perfil usam lista explícita de campos públicos. |
| Confirmado, alto | Chamadas diretas a provedores com tokens no navegador/URL | Adaptador autenticado, destinos/métodos/IDs restritos; cabeçalhos criados no servidor; redirects proibidos; erros de provedores não repassados. |
| Confirmado no código, exploração não testada | Inserção de texto de IA/dados em innerHTML | Escape nos caminhos identificados de pesquisa, tendências, logs, notificações, banco e fila; validação de IDs e URL de imagem. Revisão integral dos demais templates ainda necessária. |
| Confirmado | Dados de trabalho somente no armazenamento do navegador | Arquivos privados no servidor, acessíveis apenas com sessão; migração de dados legados não secretos após autenticação. |
| Confirmado | Quebra de sintaxe em string de uma função de tendências | Corrigida; os scripts embutidos são analisados sintaticamente nos testes. |
| Potencial | Outros pontos de XSS em templates e handlers inline | CSP restringe conexões à própria origem, mas mantém unsafe-inline por compatibilidade. Isso NÃO elimina XSS. Exige revisão completa antes de declarar segurança integral. |
| Depende de validação | Chave Google ativa, uso indevido, produção publicada e dados existentes | Validar nos painéis e logs dos provedores; não foi inferido que houve invasão. O GitHub informa Pages habilitado, o que não prova uso atual. |
| Depende de validação | Modelos de IA, permissões Meta/LinkedIn, versões de APIs, RLS do Supabase | Testes com mocks não comprovam funcionamento real; homologar com credenciais novas e escopo mínimo. |

## Rotação obrigatória e inventário

1. **Login do Sistema Modo Deus:** substituir integralmente a senha exposta; se reutilizada, trocar também nos demais serviços. A nova implantação não aceita a senha anterior por padrão: requer novo hash configurado pelo administrador.
2. **Google AI / Google Cloud:** localizar e revogar a chave embutida na versão anterior do HTML. Criar uma chave nova, restrita à API necessária, com cotas e alertas de custo. Verificar faturamento e logs desde a primeira exposição.
3. **Anthropic, D-ID, Meta Instagram, Meta WhatsApp e LinkedIn:** o código confirma mecanismos de entrada/armazenamento, não confirma que tokens reais desses serviços foram publicados. Revogar/substituir os que foram inseridos na aplicação antiga ou incluídos em backups compartilhados. Configurar novas credenciais apenas no servidor.
4. **Supabase:** identificar o tipo de chave utilizado. Uma chave pública/anon não é automaticamente um segredo, mas requer RLS correto; chaves secret/service-role precisam ser rotacionadas se usadas no navegador. Restringir a integração à tabela e operação necessárias.
5. **Cloudflare:** se um token foi inserido na versão antiga, revogá-lo e criar outro restrito à conta/projeto. A criação de projetos fica desabilitada por padrão e deve preferencialmente ficar fora do painel de conteúdo.

Nenhum valor secreto é necessário no relatório, PR ou instruções. Não cole credenciais no GitHub ou no chat.

## Histórico e resposta à exposição

Remover da ponta da branch não remove de commits anteriores, caches, forks ou clones. Revogar primeiro. Depois, um administrador deve planejar a limpeza do histórico com `git-filter-repo`, coordenar re-clones e consultar o suporte do GitHub sobre caches quando aplicável. Esta proposta NÃO reescreve histórico e NÃO faz force push. O diff de remoção também pode mostrar o segredo que já constava da base; não o copie para comentários. Habilitar secret scanning/push protection quando disponível. Revisar backups exportados, navegadores antigos e o armazenamento hospedado da versão anterior. A limpeza automática só alcança os armazenamentos conhecidos na origem em que o novo código executar; uma mudança de domínio requer limpeza separada na origem antiga.

## Limitações explícitas / condições de liberação

- Proposta para **um administrador**, um processo Node e um volume persistente. Não é um sistema multiusuário; dados antigos migrados convergem para esse único espaço. Não usar vários processos/réplicas com esta implementação.
- Sessões e limitadores em memória se perdem ao reiniciar, invalidando acessos. Limite por IP usa socket, sem confiar em X-Forwarded-For; atrás de proxy todos podem compartilhar limite. Adicionar controle de acesso/limitação no proxy, sem expor diretamente Node.
- MFA/SSO, auditoria administrativa e revisão completa de XSS ainda não implementados. **Não publicar como solução integralmente homologada.** Antes de exposição pública, concluir a revisão de templates/handlers e adotar MFA na camada de acesso quando disponível.
- Conteúdo, fila, perfil e CRM são privados no servidor, mas backups baixados continuam sob responsabilidade do operador. Não inserir prontuários/dados clínicos neste sistema de marketing.
- Operações em provedores podem gerar custos ou enviar mensagens reais. Os testes desta PR não executam essas operações. Não há retentativa automática de publicação que possa duplicá-las.
- A função de Supabase existente sincronizava apenas nome e horário: isso foi preservado, mas **não representa backup completo**.

## Testes executáveis

`npm test` usa o runner nativo do Node e provedores simulados, sem dependências externas e sem credenciais reais. Cobre autenticação, falsificação e expiração de sessão, cookies, CSRF, limitação de login, arquivos privados, perfil sem segredos, limpeza legada, restrição de destinos/métodos/contas, proteção contra redirects, remoção de autenticação fornecida pelo cliente, ausência de segredo nas respostas, limite de corpo e escape de texto. Os testes não substituem navegação funcional nem homologação dos provedores.

## Referências técnicas

- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
