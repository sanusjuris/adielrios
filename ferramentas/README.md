# Ferramentas de verificação

## Instalar

```bash
cd ferramentas
npm install
npx playwright install chromium     # ou aponte CHROMIUM_PATH para um Chromium existente
```

## Verificação end-to-end

```bash
npm run e2e
```

Sobe um servidor local, abre o Chromium e executa 15 blocos de verificação contra a aplicação real:
carga inicial · autenticação e troca de senha obrigatória · navegação pelos 18 módulos · seed de
demonstração · re-navegação com dados · Command Center · Next Best Action · CRUD pela interface ·
registro na auditoria · isolamento de permissões (cria um concierge, faz login e confirma que os
módulos bloqueados somem e que o acesso por URL é barrado) · a suíte interna de 92 asserções ·
persistência após recarregar · limpeza da massa de teste · responsividade em três larguras · tema escuro.

Falha se qualquer verificação falhar **ou** se houver um único erro de console.

## Regenerar a documentação de referência

```bash
npm run docs
```

Extrai o catálogo real do sistema em execução e reescreve `docs/INDICADORES.md`,
`docs/NEXT-BEST-ACTION.md`, `docs/PROCESSOS.md` e `docs/PERMISSOES-E-AUDITORIA.md`.
Esses quatro arquivos nunca são editados à mão — é o que garante que não divirjam da tela.
