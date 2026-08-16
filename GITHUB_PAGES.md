# Plataforma Lega — publicação no GitHub Pages

Esta pasta está pronta para ser publicada como site estático no GitHub Pages.

## Importante sobre os dados

Os eventos, clientes, lançamentos financeiros e demais registros operacionais não ficam gravados dentro destes arquivos. A versão atual utiliza `localStorage` do navegador.

Por isso, esta cópia do código não contém os eventos de teste cadastrados no endereço local `http://localhost:8001`.

Cada endereço/site possui seu próprio armazenamento local. Os dados criados no GitHub Pages ficarão no navegador/dispositivo utilizado naquele endereço até migrarmos a Plataforma para um banco central online.

## Publicação

1. Crie um repositório no GitHub.
2. Envie todo o conteúdo desta pasta para a raiz do repositório.
3. No GitHub, abra **Settings > Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**.
5. Selecione a branch `main` e a pasta `/ (root)`.
6. Salve e aguarde o endereço do GitHub Pages ser liberado.

O arquivo `.nojekyll` já está incluído para o GitHub servir os arquivos diretamente.
