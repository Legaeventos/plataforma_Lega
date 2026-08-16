# Plataforma Lega v1.1.0 — Supabase

Projeto Supabase: Plataforma Lega

Esta versão usa autenticação por e-mail/senha e sincroniza os dados compartilhados na tabela `public.lega_app_state` (registro `principal`).

## Comportamento
- Login obrigatório.
- Nome e perfil vêm de `public.lega_perfis`.
- Dados compartilhados são carregados do Supabase ao entrar.
- Alterações são salvas localmente imediatamente e enviadas ao Supabase em seguida.
- Se a internet cair durante o uso, a cópia local continua disponível e a sincronização é tentada novamente quando a conexão voltar.
- Chaves locais de sessão, usuário e navegação não são enviadas ao estado compartilhado.

## Segurança
O frontend contém apenas a Publishable Key. Nunca adicionar Secret Key ou service_role ao repositório.

## Publicação
Substituir o conteúdo do repositório GitHub Pages pelo conteúdo deste ZIP e manter Pages publicado a partir da branch main / root.
