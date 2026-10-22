# Sistema Modo Deus

Proposta de migração de uma aplicação HTML para autenticação e integrações protegidas no servidor. Consulte [SECURITY-REVIEW.md](SECURITY-REVIEW.md) para achados, credenciais a substituir e pendências de homologação.

## Implantação

1. Revogue a chave Google e substitua a senha expostas, além dos tokens efetivamente utilizados no navegador antigo. Guarde os novos valores no gerenciador de segredos do host.
2. Use Node.js 24, um processo e um volume persistente privado. GitHub Pages e hospedagem puramente estática **não executam este backend**. Não publique arquivos de ambiente, dados privados ou o diretório inteiro como conteúdo estático.
3. Configure as variáveis de `.env.example` no servidor. `AUTH_USER`, `AUTH_PASSWORD_HASH` e `APP_ORIGIN` são obrigatórias; o servidor recusa inicialização sem autenticação. Configure apenas os serviços utilizados. Não precisa instalar dependências npm.
4. Gere uma senha inédita com pelo menos 16 caracteres. Para gerar o hash sem colocar a senha no histórico do shell, execute em Bash:

   ```bash
   read -rs -p 'Nova senha: ' modo_password
   printf '%s' "$modo_password" | node scripts/password.mjs
   unset modo_password
   ```

   Guarde o resultado em `AUTH_PASSWORD_HASH` como segredo. O script lê a senha pela entrada padrão; não a recebe como argumento. Nunca copie o hash para a PR.
5. Defina `APP_ORIGIN=https://seu-dominio` sem barra final. Configure um proxy HTTPS que encaminhe o mesmo domínio para `127.0.0.1:3000`; preserve o cabeçalho Origin. O processo escuta apenas loopback. Aplique limites de requisição no proxy. Para Docker, adapte o bind e a rede privada deliberadamente; não exponha a porta diretamente.
6. Defina `DATA_DIR` em volume persistente com acesso exclusivo ao usuário do processo. Use criptografia e backups do volume pelo provedor. Crie snapshots antes de atualizações. Os arquivos são criados com modo 0600 e diretório 0700.
7. Execute `npm test` e depois `npm start`. Em desenvolvimento local, use explicitamente `NODE_ENV=development` e `APP_ORIGIN=http://127.0.0.1:3000`; apenas nesse caso o cookie dispensa Secure. Nunca use essa configuração em produção.
8. Entre no sistema. As telas existentes são mantidas; campos de tokens ficam desabilitados. A aplicação mostra somente disponibilidade/IDs públicos das integrações. A primeira leitura autenticada migra dados locais conhecidos, se ainda não existirem no servidor. Antes de migrar outro navegador, confira se ele contém dados distintos: o servidor prevalece, sem mesclagem automática.
9. Homologue geração de texto/imagem/avatar e consulta de conexão. Publicação, WhatsApp e criação Cloudflare devem ser testadas separadamente com destinos de teste e autorização do operador. A variável `ENABLE_CLOUDFLARE_DEPLOY` precisa ser `true` para permitir a função existente de criar projeto; isso não implanta automaticamente este servidor.
10. Conclua as pendências de XSS e acesso descritas na revisão antes da exposição pública. Desative a hospedagem antiga ou substitua-a por redirecionamento para o serviço seguro; confira o domínio antigo e remova caches/segredos locais. O merge desta PR sozinho **não protege a instalação antiga**.

## Verificação após implantação

- Sem login: `/api/data/perfil` e `/api/integrations` retornam 401; `.env`, `server.mjs` e dados privados não são servidos.
- DevTools: tráfego de API apenas para a própria origem, sem chaves; cookie HttpOnly/Secure/SameSite=Strict; nenhuma credencial em localStorage/sessionStorage.
- Login inválido falha, limite de tentativas funciona, logout invalida cookie anterior, sessão expira.
- Perfil, banco, fila e calendário persistem após reiniciar; reiniciar invalida todas as sessões.
- Confirmar permissões, custos, modelos disponíveis e respostas reais em homologação. A ausência de erros nos mocks não comprova compatibilidade atual dos serviços.

Rollback: parar o serviço, restaurar snapshot dos dados e uma versão **segura** anterior do backend. Não reative a autenticação antiga nem restaure credenciais revogadas. Não fazer downgrade para GitHub Pages com o código vulnerável.
